import { z } from 'zod'
import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { nextNumber } from '@/lib/server/util'

const schema = z.object({
  supplierId: z.string().min(1),
  medicineId: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  unitCost: z.number().min(0).optional().nullable(),
})

/**
 * One-click "Add to Purchase Order" from the Alerts Center.
 * Adds the medicine to the supplier's open draft PO (creating one if needed);
 * if the medicine is already on that draft, the quantity is increased.
 */
export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, schema)
  return prisma.$transaction(async tx => {
    let po = await tx.purchaseOrder.findFirst({ where: { supplierId: data.supplierId, status: 'DRAFT' }, orderBy: { createdAt: 'desc' } })
    let created = false
    if (!po) {
      const poNumber = await nextNumber(tx, `PO-${new Date().getFullYear()}`, n => `PO-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`)
      po = await tx.purchaseOrder.create({ data: { poNumber, supplierId: data.supplierId, status: 'DRAFT', createdById: user.id, notes: 'Created from Alerts Center' } })
      created = true
    }
    const lastCost = data.unitCost ?? (await tx.medicineBatch.findFirst({ where: { medicineId: data.medicineId }, orderBy: { receivedAt: 'desc' }, select: { purchasePrice: true } }))?.purchasePrice ?? null
    const existing = await tx.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id, medicineId: data.medicineId } })
    if (existing) await tx.purchaseOrderItem.update({ where: { id: existing.id }, data: { quantityOrdered: { increment: data.quantity } } })
    else await tx.purchaseOrderItem.create({ data: { purchaseOrderId: po.id, medicineId: data.medicineId, quantityOrdered: data.quantity, unitCost: lastCost } })
    return { purchaseOrderId: po.id, poNumber: po.poNumber, created, merged: !!existing }
  })
})
