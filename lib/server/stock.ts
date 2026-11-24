import { Prisma, type StockSource } from '@prisma/client'
import type { Tx } from './db'
import { HttpError } from './api'
import { todayDateOnly } from './util'

/** A batch is sellable only while its expiry date is strictly in the future. */
export function isExpired(expiryDate: Date) {
  return expiryDate.getTime() <= todayDateOnly().getTime()
}

export type ReceiveLine = {
  medicineId?: string | null
  newMedicine?: { name: string; genericName?: string | null; categoryId?: string | null; categoryName?: string | null; manufacturer?: string | null; lowStockThreshold?: number | null } | null
  batchNumber: string
  expiryDate: Date
  quantity: number
  purchasePrice: number
  mrp: number
}

export type ReconcileMatch = { poId: string; poNumber: string; poItemId: string; applied: number; ordered: number; receivedTotal: number; itemStatus: 'PARTIAL' | 'RECEIVED' }
export type ReconcileLine = { medicineId: string; medicineName: string; batchNumber: string; batchId: string; quantity: number; matches: ReconcileMatch[]; unorderedQty: number }
export type ReceiveResult = { lines: ReconcileLine[]; purchaseOrders: { id: string; poNumber: string; status: string }[] }

async function resolveCategoryId(tx: Tx, categoryId?: string | null, categoryName?: string | null) {
  if (categoryId) return categoryId
  const name = (categoryName || 'Uncategorized').trim()
  const existing = await tx.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (existing) return existing.id
  return (await tx.category.create({ data: { name, description: 'Auto-created from stock entry', color: 'slate' } })).id
}

async function resolveMedicine(tx: Tx, line: ReceiveLine) {
  if (line.medicineId) {
    const m = await tx.medicine.findUnique({ where: { id: line.medicineId } })
    if (!m) throw new HttpError(400, 'Selected medicine no longer exists')
    return m
  }
  const nm = line.newMedicine
  if (!nm?.name?.trim()) throw new HttpError(400, 'Each line needs an existing medicine or a new medicine name')
  const existing = await tx.medicine.findFirst({ where: { name: { equals: nm.name.trim(), mode: 'insensitive' } } })
  if (existing) return existing
  return tx.medicine.create({
    data: {
      name: nm.name.trim(),
      genericName: nm.genericName?.trim() || null,
      manufacturer: nm.manufacturer?.trim() || null,
      lowStockThreshold: nm.lowStockThreshold ?? null,
      categoryId: await resolveCategoryId(tx, nm.categoryId, nm.categoryName),
    },
  })
}

/**
 * Adds stock lines to inventory batches and (optionally) auto-reconciles them against
 * open purchase orders: ORDERED / PARTIALLY_RECEIVED POs are matched oldest-first,
 * preferring the explicitly linked PO, then the bill's supplier.
 */
export async function receiveStock(tx: Tx, opts: {
  lines: ReceiveLine[]
  supplierId?: string | null
  purchaseOrderId?: string | null
  supplierBillId?: string | null
  source: StockSource
  userId: string
  reconcile?: boolean
  reference?: string
}): Promise<ReceiveResult> {
  const { lines, supplierId, purchaseOrderId, supplierBillId, source, userId, reconcile = true } = opts
  if (!lines.length) throw new HttpError(400, 'Add at least one stock line')
  const result: ReconcileLine[] = []
  const touchedPos = new Set<string>()

  for (const line of lines) {
    if (line.quantity <= 0) throw new HttpError(400, `Quantity for batch ${line.batchNumber} must be positive`)
    if (line.mrp < 0 || line.purchasePrice < 0) throw new HttpError(400, `Prices for batch ${line.batchNumber} cannot be negative`)
    const medicine = await resolveMedicine(tx, line)
    const batchNumber = line.batchNumber.trim().toUpperCase()

    const existing = await tx.medicineBatch.findUnique({ where: { medicineId_batchNumber: { medicineId: medicine.id, batchNumber } } })
    if (existing && existing.expiryDate.getTime() !== line.expiryDate.getTime()) {
      throw new HttpError(409, `Batch ${batchNumber} of ${medicine.name} already exists with a different expiry date (${existing.expiryDate.toISOString().slice(0, 10)}). Check the batch number.`)
    }
    const batch = existing
      ? await tx.medicineBatch.update({
          where: { id: existing.id },
          data: { quantity: { increment: line.quantity }, receivedQty: { increment: line.quantity }, purchasePrice: line.purchasePrice, mrp: line.mrp, supplierId: supplierId ?? existing.supplierId },
        })
      : await tx.medicineBatch.create({
          data: { medicineId: medicine.id, supplierId: supplierId ?? null, batchNumber, expiryDate: line.expiryDate, quantity: line.quantity, receivedQty: line.quantity, purchasePrice: line.purchasePrice, mrp: line.mrp, source, supplierBillId: supplierBillId ?? null },
        })
    await tx.stockMovement.create({ data: { batchId: batch.id, type: 'PURCHASE', quantity: line.quantity, reference: opts.reference ?? (source === 'AI_BILL' ? 'AI supplier bill' : 'Manual stock entry'), userId } })

    const out: ReconcileLine = { medicineId: medicine.id, medicineName: medicine.name, batchNumber, batchId: batch.id, quantity: line.quantity, matches: [], unorderedQty: line.quantity }

    if (reconcile) {
      const candidates = await tx.purchaseOrderItem.findMany({
        where: {
          medicineId: medicine.id,
          status: { in: ['PENDING', 'PARTIAL'] },
          purchaseOrder: { status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] }, ...(supplierId && !purchaseOrderId ? { supplierId } : {}) },
          ...(purchaseOrderId ? { OR: [{ purchaseOrderId }, ...(supplierId ? [{ purchaseOrder: { supplierId } }] : [])] } : {}),
        },
        include: { purchaseOrder: { select: { id: true, poNumber: true, orderedAt: true, createdAt: true } } },
      })
      if (candidates.length) {
        // Row-lock the candidate lines so concurrent receipts cannot over-fill them.
        await tx.$queryRaw`SELECT id FROM "PurchaseOrderItem" WHERE id IN (${Prisma.join(candidates.map(c => c.id))}) FOR UPDATE`
      }
      candidates.sort((a, b) => {
        if (purchaseOrderId) {
          const pa = a.purchaseOrderId === purchaseOrderId ? 0 : 1, pb = b.purchaseOrderId === purchaseOrderId ? 0 : 1
          if (pa !== pb) return pa - pb
        }
        return (a.purchaseOrder.orderedAt ?? a.purchaseOrder.createdAt).getTime() - (b.purchaseOrder.orderedAt ?? b.purchaseOrder.createdAt).getTime()
      })
      let remaining = line.quantity
      for (const c of candidates) {
        if (remaining <= 0) break
        const fresh = await tx.purchaseOrderItem.findUniqueOrThrow({ where: { id: c.id } })
        const open = fresh.quantityOrdered - fresh.quantityReceived
        if (open <= 0) continue
        const applied = Math.min(open, remaining)
        remaining -= applied
        const receivedTotal = fresh.quantityReceived + applied
        const itemStatus = receivedTotal >= fresh.quantityOrdered ? 'RECEIVED' : 'PARTIAL'
        await tx.purchaseOrderItem.update({ where: { id: c.id }, data: { quantityReceived: receivedTotal, status: itemStatus, lastReceivedAt: new Date() } })
        await tx.poReceipt.create({ data: { poItemId: c.id, batchId: batch.id, quantity: applied, supplierBillId: supplierBillId ?? null } })
        touchedPos.add(c.purchaseOrderId)
        out.matches.push({ poId: c.purchaseOrderId, poNumber: c.purchaseOrder.poNumber, poItemId: c.id, applied, ordered: fresh.quantityOrdered, receivedTotal, itemStatus })
      }
      out.unorderedQty = remaining
    }
    result.push(out)
  }

  const purchaseOrders = []
  for (const poId of touchedPos) purchaseOrders.push(await refreshPoStatus(tx, poId))
  return { lines: result, purchaseOrders }
}

export async function refreshPoStatus(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } })
  if (po.status === 'CANCELLED' || po.status === 'DRAFT') return { id: po.id, poNumber: po.poNumber, status: po.status }
  const allReceived = po.items.length > 0 && po.items.every(i => i.quantityReceived >= i.quantityOrdered)
  const anyReceived = po.items.some(i => i.quantityReceived > 0)
  const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'ORDERED'
  const updated = await tx.purchaseOrder.update({ where: { id: poId }, data: { status, receivedAt: allReceived ? new Date() : null } })
  return { id: updated.id, poNumber: updated.poNumber, status: updated.status }
}

/**
 * FEFO allocation: takes stock from the earliest-expiring non-expired batches.
 * Uses conditional decrements so concurrent sales can never oversell a batch.
 */
export async function allocateFefo(tx: Tx, medicineId: string, qty: number) {
  const batches = await tx.medicineBatch.findMany({
    where: { medicineId, quantity: { gt: 0 }, expiryDate: { gt: todayDateOnly() } },
    orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
  })
  const available = batches.reduce((s, b) => s + b.quantity, 0)
  if (available < qty) return { ok: false as const, available }
  const allocations: { batch: (typeof batches)[number]; take: number }[] = []
  let need = qty
  for (const b of batches) {
    if (need <= 0) break
    const take = Math.min(b.quantity, need)
    const res = await tx.medicineBatch.updateMany({ where: { id: b.id, quantity: { gte: take } }, data: { quantity: { decrement: take } } })
    if (res.count !== 1) throw new HttpError(409, 'Stock changed while completing the sale. Please try again.')
    allocations.push({ batch: b, take })
    need -= take
  }
  return { ok: true as const, allocations }
}
