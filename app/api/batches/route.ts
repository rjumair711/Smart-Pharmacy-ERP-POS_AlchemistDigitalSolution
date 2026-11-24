import type { Prisma } from '@prisma/client'
import { route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { daysUntil, getSettings } from '@/lib/server/util'
import { isExpired } from '@/lib/server/stock'

/** GET /api/batches?supplierId=&medicineId=&q= — on-hand batches (used for supplier returns) */
export const GET = route(['ADMIN'], async req => {
  const sp = req.nextUrl.searchParams
  const supplierId = sp.get('supplierId'), medicineId = sp.get('medicineId'), q = sp.get('q')?.trim()
  const where: Prisma.MedicineBatchWhereInput = {
    quantity: { gt: 0 },
    ...(supplierId ? { OR: [{ supplierId }, { supplierId: null }] } : {}),
    ...(medicineId ? { medicineId } : {}),
    ...(q ? { AND: [{ OR: [{ batchNumber: { contains: q, mode: 'insensitive' } }, { medicine: { name: { contains: q, mode: 'insensitive' } } }] }] } : {}),
  }
  const [settings, batches] = await Promise.all([
    getSettings(prisma),
    prisma.medicineBatch.findMany({ where, orderBy: { expiryDate: 'asc' }, take: 300, include: { medicine: { select: { id: true, name: true, expiryLeadDays: true, category: { select: { name: true } } } }, supplier: { select: { id: true, name: true } } } }),
  ])
  return batches.map(b => {
    const days = daysUntil(b.expiryDate)
    const lead = b.medicine.expiryLeadDays ?? settings.expiryLeadDays
    return {
      id: b.id, batchNumber: b.batchNumber, medicineId: b.medicine.id, medicineName: b.medicine.name, category: b.medicine.category.name,
      supplierId: b.supplier?.id ?? null, supplierName: b.supplier?.name ?? null, expiryDate: b.expiryDate.toISOString().slice(0, 10), daysRemaining: days,
      quantity: b.quantity, purchasePrice: b.purchasePrice, mrp: b.mrp,
      state: isExpired(b.expiryDate) ? 'Expired' : days <= lead ? 'Near expiry' : 'Valid',
    }
  })
})
