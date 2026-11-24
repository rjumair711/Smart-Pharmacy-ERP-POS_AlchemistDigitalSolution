import { route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { categorySales, dailySeries, periodTotals, stockValuation } from '@/lib/server/metrics'
import { localDateString, localDayStart, todayDateOnly } from '@/lib/server/util'

const DAY = 86_400_000

/** GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive; default month-to-date) */
export const GET = route(['ADMIN'], async req => {
  const sp = req.nextUrl.searchParams
  const today = localDateString()
  const fromStr = sp.get('from') || `${today.slice(0, 7)}-01`
  const toStr = sp.get('to') || today
  const from = localDayStart(fromStr)
  const to = new Date(localDayStart(toStr).getTime() + DAY)
  const span = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - span)

  const [totals, previous, daily, categories, valuation, topMedicines, purchases, supplierReturns, customerReturns, expiredStock, expiredReturned] = await Promise.all([
    periodTotals(from, to),
    periodTotals(prevFrom, from),
    dailySeries(from, to),
    categorySales(from, to),
    stockValuation(),
    prisma.$queryRaw<{ name: string; units: number; revenue: number; profit: number }[]>`
      SELECT m.name, SUM(si.quantity - si."returnedQuantity")::int AS units, SUM(si."lineTotal")::float AS revenue,
             SUM(si."lineTotal" - si."unitCost" * si.quantity)::float AS profit
      FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" JOIN "Medicine" m ON m.id = si."medicineId"
      WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY m.name ORDER BY revenue DESC LIMIT 10`,
    prisma.$queryRaw<{ supplier: string; units: number; value: number; batches: number }[]>`
      SELECT COALESCE(sup.name, 'Unassigned') AS supplier, SUM(sm.quantity)::int AS units, SUM(sm.quantity * b."purchasePrice")::float AS value, COUNT(DISTINCT b.id)::int AS batches
      FROM "StockMovement" sm JOIN "MedicineBatch" b ON b.id = sm."batchId" LEFT JOIN "Supplier" sup ON sup.id = b."supplierId"
      WHERE sm.type = 'PURCHASE' AND sm."createdAt" >= ${from} AND sm."createdAt" < ${to}
      GROUP BY 1 ORDER BY value DESC`,
    prisma.supplierReturn.groupBy({ by: ['reason'], where: { createdAt: { gte: from, lt: to } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.customerReturn.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, take: 50, include: { sale: { select: { invoiceNumber: true } }, items: { select: { quantity: true, restocked: true } } } }),
    prisma.medicineBatch.findMany({ where: { quantity: { gt: 0 }, expiryDate: { lte: todayDateOnly() } }, orderBy: { expiryDate: 'asc' }, include: { medicine: { select: { name: true } }, supplier: { select: { name: true } } } }),
    prisma.supplierReturn.aggregate({ where: { createdAt: { gte: from, lt: to }, reason: { in: ['EXPIRED', 'NEAR_EXPIRY'] } }, _sum: { totalAmount: true } }),
  ])

  const byDay = new Map(daily.map(d => [d.date, d]))
  const days: { date: string; revenue: number; profit: number; invoices: number }[] = []
  for (let t = from.getTime() + DAY / 2; t < to.getTime(); t += DAY) {
    const date = localDateString(new Date(t))
    days.push(byDay.get(date) ?? { date, revenue: 0, profit: 0, invoices: 0 })
  }
  const writeOffUnits = customerReturns.reduce((s, r) => s + r.items.filter(i => !i.restocked).reduce((x, i) => x + i.quantity, 0), 0)

  return {
    range: { from: fromStr, to: toStr },
    totals, previous, days, categories, topMedicines, valuation, purchases,
    returns: {
      customer: { count: totals.returns, refunded: totals.refunds, writeOffUnits, rows: customerReturns.map(r => ({ returnNumber: r.returnNumber, invoiceNumber: r.sale.invoiceNumber, refundAmount: r.refundAmount, units: r.items.reduce((s, i) => s + i.quantity, 0), createdAt: r.createdAt, reason: r.reason })) },
      supplier: supplierReturns.map(r => ({ reason: r.reason, count: r._count._all, value: Number(r._sum.totalAmount ?? 0) })),
    },
    expiry: {
      expiredOnHandValue: expiredStock.reduce((s, b) => s + b.quantity * Number(b.purchasePrice), 0),
      expiredOnHandUnits: expiredStock.reduce((s, b) => s + b.quantity, 0),
      returnedToSuppliersValue: Number(expiredReturned._sum.totalAmount ?? 0),
      rows: expiredStock.map(b => ({ medicine: b.medicine.name, batchNumber: b.batchNumber, supplier: b.supplier?.name ?? null, expiryDate: b.expiryDate.toISOString().slice(0, 10), quantity: b.quantity, value: b.quantity * Number(b.purchasePrice) })),
    },
  }
})
