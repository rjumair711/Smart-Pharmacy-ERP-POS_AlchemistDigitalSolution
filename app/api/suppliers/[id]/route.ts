import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { supplierSchema } from '@/lib/server/schemas'

export const GET = route(['ADMIN'], async (_req, { params }) => {
  const s = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 25, include: { items: { select: { quantityOrdered: true, quantityReceived: true, unitCost: true } } } },
      supplierReturns: { orderBy: { createdAt: 'desc' }, take: 25 },
      batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: 'asc' }, take: 50, include: { medicine: { select: { name: true } } } },
    },
  })
  if (!s) throw new HttpError(404, 'Supplier not found')
  return s
})

export const PATCH = route(['ADMIN'], async (req, { params }) => {
  const data = await body(req, supplierSchema.partial())
  return prisma.supplier.update({ where: { id: params.id }, data: { ...data, email: data.email === '' ? null : data.email } })
})

export const DELETE = route(['ADMIN'], async (_req, { params }) => {
  const [pos, batches, rets] = await Promise.all([
    prisma.purchaseOrder.count({ where: { supplierId: params.id } }),
    prisma.medicineBatch.count({ where: { supplierId: params.id } }),
    prisma.supplierReturn.count({ where: { supplierId: params.id } }),
  ])
  if (pos + batches + rets > 0) {
    await prisma.supplier.update({ where: { id: params.id }, data: { active: false } })
    return { ok: true, deactivated: true }
  }
  await prisma.supplier.delete({ where: { id: params.id } })
  return { ok: true, deleted: true }
})
