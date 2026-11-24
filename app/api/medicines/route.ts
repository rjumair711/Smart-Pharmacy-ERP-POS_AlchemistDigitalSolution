import type { Prisma } from '@prisma/client'
import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { medicineSummaries } from '@/lib/server/inventory'
import { medicineSchema } from '@/lib/server/schemas'

/** GET /api/medicines?q=&categoryId=&status=&page=&pageSize=  — inventory list & stock lookup (all roles) */
export const GET = route(null, async req => {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim()
  const categoryId = sp.get('categoryId') || undefined
  const status = sp.get('status')
  const page = Math.max(1, Number(sp.get('page') || 1))
  const pageSize = Math.min(500, Math.max(1, Number(sp.get('pageSize') || 25)))
  const where: Prisma.MedicineWhereInput = {
    active: sp.get('includeInactive') ? undefined : true,
    ...(categoryId ? { categoryId } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { genericName: { contains: q, mode: 'insensitive' } }, { barcode: q }, { category: { name: { contains: q, mode: 'insensitive' } } }, { batches: { some: { batchNumber: { contains: q, mode: 'insensitive' } } } }] } : {}),
  }
  const all = await medicineSummaries(prisma, where)
  const filtered = status && status !== 'All' ? all.filter(m => m.status === status) : all
  const totals = {
    medicines: all.length,
    units: all.reduce((s, m) => s + m.stock, 0),
    lowStock: all.filter(m => m.status === 'Low stock').length,
    outOfStock: all.filter(m => m.status === 'Out of stock').length,
    expiringSoon: all.filter(m => m.status === 'Expiring soon').length,
    categories: new Set(all.map(m => m.categoryId)).size,
  }
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, totals }
})

/** Create a medicine master record (without stock) */
export const POST = route(['ADMIN'], async req => {
  const data = await body(req, medicineSchema)
  return prisma.medicine.create({ data })
})
