import { z } from 'zod'
import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { poSummary } from '@/lib/server/po'

const include = {
  supplier: { select: { id: true, name: true, phone: true, email: true, contactPerson: true } },
  createdBy: { select: { name: true } },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      medicine: { select: { id: true, name: true, genericName: true, category: { select: { name: true } } } },
      receipts: { orderBy: { createdAt: 'asc' as const }, include: { batch: { select: { batchNumber: true, expiryDate: true } }, supplierBill: { select: { billNumber: true } } } },
    },
  },
}

async function load(id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { OR: [{ id }, { poNumber: id }] }, include })
  if (!po) throw new HttpError(404, 'Purchase order not found')
  return po
}

export const GET = route(['ADMIN'], async (_req, { params }) => {
  const po = await load(params.id)
  return { ...poSummary(po), supplier: po.supplier, createdBy: po.createdBy.name, items: po.items }
})

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('order') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('close') }), // close a partially received PO, dropping the backorder
  z.object({
    action: z.literal('update'),
    notes: z.string().max(500).optional().nullable(),
    items: z.array(z.object({ medicineId: z.string(), quantity: z.number().int().positive(), unitCost: z.number().min(0).optional().nullable() })).min(1).optional(),
  }),
])

export const PATCH = route(['ADMIN'], async (req, { params }) => {
  const data = await body(req, patchSchema)
  const po = await load(params.id)
  if (data.action === 'order') {
    if (po.status !== 'DRAFT') throw new HttpError(409, 'Only draft orders can be placed')
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'ORDERED', orderedAt: new Date() } })
  } else if (data.action === 'cancel') {
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') throw new HttpError(409, `A ${po.status.toLowerCase()} order cannot be cancelled`)
    if (po.items.some(i => i.quantityReceived > 0)) throw new HttpError(409, 'Stock has already been received on this order — close it instead of cancelling')
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'CANCELLED' } })
  } else if (data.action === 'close') {
    if (po.status !== 'PARTIALLY_RECEIVED') throw new HttpError(409, 'Only partially received orders can be closed')
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED', receivedAt: new Date(), notes: [po.notes, 'Closed with backorder cancelled'].filter(Boolean).join(' · ') } })
  } else {
    if (po.status !== 'DRAFT') throw new HttpError(409, 'Only draft orders can be edited')
    await prisma.$transaction(async tx => {
      if (data.notes !== undefined) await tx.purchaseOrder.update({ where: { id: po.id }, data: { notes: data.notes } })
      if (data.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } })
        await tx.purchaseOrderItem.createMany({ data: data.items.map(i => ({ purchaseOrderId: po.id, medicineId: i.medicineId, quantityOrdered: i.quantity, unitCost: i.unitCost ?? null })) })
      }
    })
  }
  const fresh = await load(po.id)
  return { ...poSummary(fresh), supplier: fresh.supplier, createdBy: fresh.createdBy.name, items: fresh.items }
})

export const DELETE = route(['ADMIN'], async (_req, { params }) => {
  const po = await load(params.id)
  if (po.status !== 'DRAFT') throw new HttpError(409, 'Only draft orders can be deleted — cancel placed orders instead')
  await prisma.purchaseOrder.delete({ where: { id: po.id } })
  return { ok: true }
})
