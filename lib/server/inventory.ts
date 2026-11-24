import type { Prisma } from '@prisma/client'
import type { Tx } from './db'
import { daysUntil, getSettings } from './util'
import { isExpired } from './stock'

export type StockStatus = 'In stock' | 'Low stock' | 'Out of stock' | 'Expiring soon'

/** Aggregated, FEFO-aware view of medicines for inventory lists, stock lookup and POS. */
export async function medicineSummaries(db: Tx, where: Prisma.MedicineWhereInput = {}) {
  const settings = await getSettings(db)
  const meds = await db.medicine.findMany({
    relationLoadStrategy: 'join',
    where,
    orderBy: { name: 'asc' },
    include: {
      category: { select: { id: true, name: true } },
      batches: { where: { quantity: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }], include: { supplier: { select: { id: true, name: true } } } },
    },
  })
  return meds.map(m => {
    const threshold = m.lowStockThreshold ?? settings.lowStockThreshold
    const leadDays = m.expiryLeadDays ?? settings.expiryLeadDays
    const valid = m.batches.filter(b => !isExpired(b.expiryDate))
    const expired = m.batches.filter(b => isExpired(b.expiryDate))
    const stock = valid.reduce((s, b) => s + b.quantity, 0)
    const fefo = valid[0] ?? null
    const nearestDays = fefo ? daysUntil(fefo.expiryDate) : null
    const status: StockStatus = stock === 0 ? 'Out of stock' : nearestDays !== null && nearestDays <= leadDays ? 'Expiring soon' : stock <= threshold ? 'Low stock' : 'In stock'
    return {
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      manufacturer: m.manufacturer,
      barcode: m.barcode,
      unit: m.unit,
      active: m.active,
      categoryId: m.category.id,
      category: m.category.name,
      lowStockThreshold: m.lowStockThreshold,
      expiryLeadDays: m.expiryLeadDays,
      effectiveThreshold: threshold,
      effectiveLeadDays: leadDays,
      stock,
      expiredStock: expired.reduce((s, b) => s + b.quantity, 0),
      batchCount: m.batches.length,
      nearestExpiry: fefo?.expiryDate.toISOString().slice(0, 10) ?? null,
      nearestExpiryDays: nearestDays,
      fefoBatch: fefo ? { id: fefo.id, batchNumber: fefo.batchNumber, expiryDate: fefo.expiryDate.toISOString().slice(0, 10), quantity: fefo.quantity, mrp: Number(fefo.mrp) } : null,
      price: fefo ? Number(fefo.mrp) : m.batches.length ? Number(m.batches[m.batches.length - 1].mrp) : 0,
      supplier: (fefo ?? m.batches[0])?.supplier?.name ?? null,
      status,
    }
  })
}
