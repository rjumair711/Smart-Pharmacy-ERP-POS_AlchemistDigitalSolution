import type { Tx } from './db'
import { daysUntil, getSettings } from './util'
import { isExpired } from './stock'

export type AlertKind = 'EXPIRED' | 'EXPIRING_SOON' | 'LOW_STOCK' | 'OUT_OF_STOCK'
export type Alert = {
  kind: AlertKind
  medicineId: string
  medicineName: string
  genericName: string | null
  category: string
  batchId: string | null
  batchNumber: string | null
  expiryDate: string | null
  daysRemaining: number | null
  remaining: number
  threshold: number
  leadDays: number
  supplierId: string | null
  supplierName: string | null
  suggestedQty: number
  onOrder: number
}

export async function computeAlerts(db: Tx) {
  const settings = await getSettings(db)
  const medicines = await db.medicine.findMany({
    relationLoadStrategy: 'join',
    where: { active: true },
    include: {
      category: { select: { name: true } },
      batches: { include: { supplier: { select: { id: true, name: true } } }, orderBy: { expiryDate: 'asc' } },
      poItems: { where: { status: { in: ['PENDING', 'PARTIAL'] }, purchaseOrder: { status: { in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] } } }, select: { quantityOrdered: true, quantityReceived: true } },
    },
  })
  const alerts: Alert[] = []
  for (const m of medicines) {
    const leadDays = m.expiryLeadDays ?? settings.expiryLeadDays
    const threshold = m.lowStockThreshold ?? settings.lowStockThreshold
    const lastBatch = [...m.batches].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0]
    const supplier = lastBatch?.supplier ?? null
    const onOrder = m.poItems.reduce((s, i) => s + (i.quantityOrdered - i.quantityReceived), 0)
    let sellable = 0
    const base = { medicineId: m.id, medicineName: m.name, genericName: m.genericName, category: m.category.name, threshold, leadDays, supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? null, onOrder }

    for (const b of m.batches) {
      if (b.quantity <= 0) continue
      const days = daysUntil(b.expiryDate)
      const batchInfo = { batchId: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate.toISOString().slice(0, 10), daysRemaining: days, remaining: b.quantity }
      if (isExpired(b.expiryDate)) {
        if (settings.expiryAlertsEnabled) alerts.push({ ...base, ...batchInfo, kind: 'EXPIRED', suggestedQty: b.quantity })
        continue
      }
      sellable += b.quantity
      if (settings.expiryAlertsEnabled && days <= leadDays) alerts.push({ ...base, ...batchInfo, kind: 'EXPIRING_SOON', suggestedQty: b.quantity })
    }
    if (settings.lowStockAlertsEnabled) {
      const suggestedQty = Math.max(threshold * 2 - sellable - onOrder, threshold, 1)
      const nearest = m.batches.find(b => b.quantity > 0 && !isExpired(b.expiryDate))
      const stockInfo = { batchId: nearest?.id ?? null, batchNumber: nearest?.batchNumber ?? null, expiryDate: nearest ? nearest.expiryDate.toISOString().slice(0, 10) : null, daysRemaining: nearest ? daysUntil(nearest.expiryDate) : null, remaining: sellable }
      if (sellable === 0) alerts.push({ ...base, ...stockInfo, kind: 'OUT_OF_STOCK', suggestedQty })
      else if (sellable <= threshold) alerts.push({ ...base, ...stockInfo, kind: 'LOW_STOCK', suggestedQty })
    }
  }
  const order: Record<AlertKind, number> = { EXPIRED: 0, OUT_OF_STOCK: 1, EXPIRING_SOON: 2, LOW_STOCK: 3 }
  alerts.sort((a, b) => order[a.kind] - order[b.kind] || (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999) || a.remaining - b.remaining)
  const counts = { EXPIRED: 0, EXPIRING_SOON: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 } as Record<AlertKind, number>
  for (const a of alerts) counts[a.kind]++
  return { alerts, counts, total: alerts.length, settings: { expiryLeadDays: settings.expiryLeadDays, lowStockThreshold: settings.lowStockThreshold } }
}
