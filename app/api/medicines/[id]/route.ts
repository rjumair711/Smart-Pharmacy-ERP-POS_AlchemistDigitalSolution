import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { medicineSummaries } from '@/lib/server/inventory'
import { medicineSchema } from '@/lib/server/schemas'
import { daysUntil } from '@/lib/server/util'
import { isExpired } from '@/lib/server/stock'

export const GET = route(null, async (_req, { params, user }) => {
  const [summary] = await medicineSummaries(prisma, { id: params.id })
  if (!summary) throw new HttpError(404, 'Medicine not found')
  const batches = await prisma.medicineBatch.findMany({
    where: { medicineId: params.id },
    orderBy: [{ expiryDate: 'asc' }],
    include: { supplier: { select: { id: true, name: true } } },
  })
  const fefoId = summary.fefoBatch?.id
  const movements = await prisma.stockMovement.findMany({
    where: { batch: { medicineId: params.id } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { batch: { select: { batchNumber: true } }, user: { select: { name: true } } },
  })
  const isAdmin = user.role === 'ADMIN'
  return {
    ...summary,
    batches: batches.map(b => ({
      id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate.toISOString().slice(0, 10), daysRemaining: daysUntil(b.expiryDate),
      quantity: b.quantity, receivedQty: b.receivedQty, mrp: Number(b.mrp), purchasePrice: isAdmin ? Number(b.purchasePrice) : null,
      supplier: b.supplier?.name ?? null, receivedAt: b.receivedAt, source: b.source,
      state: b.quantity === 0 ? 'Depleted' : isExpired(b.expiryDate) ? 'Expired' : b.id === fefoId ? 'FEFO priority' : 'In stock',
    })),
    movements: movements.map(m => ({ id: m.id, type: m.type, quantity: m.quantity, reference: m.reference, batchNumber: m.batch.batchNumber, user: m.user?.name ?? null, createdAt: m.createdAt })),
  }
})

export const PATCH = route(['ADMIN'], async (req, { params }) => {
  const data = await body(req, medicineSchema.partial())
  return prisma.medicine.update({ where: { id: params.id }, data })
})

/** Admin only: hard-delete a medicine with no history, otherwise deactivate it. */
export const DELETE = route(['ADMIN'], async (_req, { params }) => {
  const [batches, sales, poItems] = await Promise.all([
    prisma.medicineBatch.count({ where: { medicineId: params.id } }),
    prisma.saleItem.count({ where: { medicineId: params.id } }),
    prisma.purchaseOrderItem.count({ where: { medicineId: params.id } }),
  ])
  if (batches + sales + poItems > 0) {
    await prisma.medicine.update({ where: { id: params.id }, data: { active: false } })
    return { ok: true, deactivated: true }
  }
  await prisma.medicine.delete({ where: { id: params.id } })
  return { ok: true, deleted: true }
})
