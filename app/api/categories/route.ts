import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { todayDateOnly } from '@/lib/server/util'
import { categorySchema } from '@/lib/server/schemas'

export const GET = route(null, async () => {
  const [categories, stock] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { medicines: true } } } }),
    prisma.$queryRaw<{ categoryId: string; units: bigint }[]>`
      SELECT m."categoryId", COALESCE(SUM(b.quantity), 0)::bigint AS units
      FROM "Medicine" m LEFT JOIN "MedicineBatch" b ON b."medicineId" = m.id AND b."expiryDate" > ${todayDateOnly()}
      GROUP BY m."categoryId"`,
  ])
  const units = new Map(stock.map(s => [s.categoryId, Number(s.units)]))
  return categories.map(c => ({ id: c.id, name: c.name, description: c.description, color: c.color, medicineCount: c._count.medicines, units: units.get(c.id) ?? 0 }))
})

export const POST = route(['ADMIN'], async req => {
  const data = await body(req, categorySchema)
  return prisma.category.create({ data })
})
