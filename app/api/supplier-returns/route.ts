import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { supplierReturnSchema } from '@/lib/server/schemas'
import { money, nextNumber } from '@/lib/server/util'

export const GET = route(['ADMIN'], async () => {
  const rows = await prisma.supplierReturn.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { supplier: { select: { name: true } }, processedBy: { select: { name: true } }, items: { select: { quantity: true } } },
  })
  return rows.map(r => ({ id: r.id, debitNoteNumber: r.debitNoteNumber, supplier: r.supplier.name, reason: r.reason, totalAmount: r.totalAmount, units: r.items.reduce((s, i) => s + i.quantity, 0), lines: r.items.length, processedBy: r.processedBy.name, createdAt: r.createdAt, notes: r.notes }))
})

/** Purchase return: deducts expired / near-expiry / damaged batches from stock and records a debit note. */
export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, supplierReturnSchema)
  const result = await prisma.$transaction(async tx => {
    const supplier = await tx.supplier.findUnique({ where: { id: data.supplierId } })
    if (!supplier) throw new HttpError(404, 'Supplier not found')
    const batches = await tx.medicineBatch.findMany({ where: { id: { in: data.items.map(i => i.batchId) } }, include: { medicine: { select: { name: true } } } })
    let total = 0
    const lines = []
    for (const item of data.items) {
      const b = batches.find(x => x.id === item.batchId)
      if (!b) throw new HttpError(400, 'Selected batch not found')
      if (b.supplierId && b.supplierId !== supplier.id) throw new HttpError(400, `Batch ${b.batchNumber} (${b.medicine.name}) was received from a different supplier`)
      const res = await tx.medicineBatch.updateMany({ where: { id: b.id, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } })
      if (res.count !== 1) throw new HttpError(409, `Batch ${b.batchNumber} (${b.medicine.name}) has only ${b.quantity} unit(s) on hand`)
      const lineTotal = money(Number(b.purchasePrice) * item.quantity)
      total += lineTotal
      lines.push({ batchId: b.id, quantity: item.quantity, unitCost: b.purchasePrice, lineTotal })
    }
    const debitNoteNumber = await nextNumber(tx, 'DN', n => `DN-${String(n).padStart(5, '0')}`)
    const ret = await tx.supplierReturn.create({
      data: { debitNoteNumber, supplierId: supplier.id, processedById: user.id, reason: data.reason, notes: data.notes || null, totalAmount: money(total), items: { createMany: { data: lines } } },
    })
    await tx.stockMovement.createMany({ data: lines.map(l => ({ batchId: l.batchId, type: 'SUPPLIER_RETURN' as const, quantity: -l.quantity, reference: debitNoteNumber, userId: user.id })) })
    return ret
  }, { timeout: 30_000, maxWait: 10_000 })
  return { id: result.id, debitNoteNumber: result.debitNoteNumber, totalAmount: result.totalAmount }
})
