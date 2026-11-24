import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { supplierSchema } from '@/lib/server/schemas'

export const GET = route(null, async req => {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const suppliers = await prisma.supplier.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { contactPerson: { contains: q, mode: 'insensitive' } }] } : undefined,
    orderBy: { name: 'asc' },
    include: { purchaseOrders: { select: { status: true, items: { select: { quantityOrdered: true, quantityReceived: true, unitCost: true } } } } },
  })
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const purchases = await prisma.$queryRaw<{ supplierId: string; total: number }[]>`
    SELECT b."supplierId", COALESCE(SUM(sm.quantity * b."purchasePrice"), 0)::float AS total
    FROM "StockMovement" sm JOIN "MedicineBatch" b ON b.id = sm."batchId"
    WHERE sm.type = 'PURCHASE' AND sm."createdAt" >= ${monthStart} AND b."supplierId" IS NOT NULL
    GROUP BY b."supplierId"`
  const monthTotals = new Map(purchases.map(p => [p.supplierId, p.total]))
  return suppliers.map(({ purchaseOrders, ...s }) => {
    const open = purchaseOrders.filter(p => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED')
    return {
      ...s,
      totalOrders: purchaseOrders.filter(p => p.status !== 'DRAFT').length,
      openOrders: open.length,
      openValue: open.reduce((sum, p) => sum + p.items.reduce((x, i) => x + Math.max(0, i.quantityOrdered - i.quantityReceived) * Number(i.unitCost ?? 0), 0), 0),
      purchasesThisMonth: monthTotals.get(s.id) ?? 0,
    }
  })
})

export const POST = route(['ADMIN'], async req => {
  const data = await body(req, supplierSchema)
  return prisma.supplier.create({ data: { ...data, email: data.email || null } })
})
