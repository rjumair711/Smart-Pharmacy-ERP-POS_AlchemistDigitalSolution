import { prisma } from './db'
import { PHARMACY_TZ, todayDateOnly } from './util'

/**
 * Financial totals for [from, to).
 * Net profit = (Sales − Customer refunds) − (Purchase cost of goods sold − Cost of units restocked from returns)
 */
export async function periodTotals(from: Date, to: Date) {
  const range = { gte: from, lt: to }
  const [sales, returns, items] = await Promise.all([
    prisma.sale.aggregate({ where: { createdAt: range }, _sum: { total: true, costTotal: true, discount: true, tax: true }, _count: true }),
    prisma.customerReturn.aggregate({ where: { createdAt: range }, _sum: { refundAmount: true, restockedCost: true }, _count: true }),
    prisma.saleItem.aggregate({ where: { sale: { createdAt: range } }, _sum: { quantity: true, returnedQuantity: true } }),
  ])
  const revenue = Number(sales._sum.total ?? 0)
  const refunds = Number(returns._sum.refundAmount ?? 0)
  const cogs = Number(sales._sum.costTotal ?? 0) - Number(returns._sum.restockedCost ?? 0)
  const netSales = revenue - refunds
  const netProfit = netSales - cogs
  return {
    revenue, refunds, netSales, cogs, netProfit,
    margin: netSales > 0 ? netProfit / netSales : 0,
    invoices: sales._count, returns: returns._count,
    discount: Number(sales._sum.discount ?? 0), tax: Number(sales._sum.tax ?? 0),
    unitsSold: Number(items._sum.quantity ?? 0) - Number(items._sum.returnedQuantity ?? 0),
    averageOrder: sales._count ? revenue / sales._count : 0,
  }
}

/** Daily revenue / profit series (local days) between two UTC instants. */
export async function dailySeries(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ day: Date; revenue: number; cost: number; invoices: number }[]>`
    SELECT (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${PHARMACY_TZ}::text)::date AS day,
           SUM(s.total)::float AS revenue, SUM(s."costTotal")::float AS cost, COUNT(*)::int AS invoices
    FROM "Sale" s WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
    GROUP BY 1 ORDER BY 1`
  const refunds = await prisma.$queryRaw<{ day: Date; refund: number; restocked: number }[]>`
    SELECT (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${PHARMACY_TZ}::text)::date AS day,
           SUM(r."refundAmount")::float AS refund, SUM(r."restockedCost")::float AS restocked
    FROM "CustomerReturn" r WHERE r."createdAt" >= ${from} AND r."createdAt" < ${to}
    GROUP BY 1`
  const refundMap = new Map(refunds.map(r => [r.day.toISOString().slice(0, 10), r]))
  return rows.map(r => {
    const key = r.day.toISOString().slice(0, 10)
    const ref = refundMap.get(key)
    const revenue = r.revenue - (ref?.refund ?? 0)
    return { date: key, revenue, profit: revenue - (r.cost - (ref?.restocked ?? 0)), invoices: r.invoices }
  })
}

export async function monthlySeries(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ month: string; revenue: number; cost: number }[]>`
    SELECT to_char(date_trunc('month', s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${PHARMACY_TZ}::text), 'YYYY-MM') AS month,
           SUM(s.total)::float AS revenue, SUM(s."costTotal")::float AS cost
    FROM "Sale" s WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
    GROUP BY 1 ORDER BY 1`
  return rows.map(r => ({ month: r.month, revenue: r.revenue, profit: r.revenue - r.cost }))
}

export async function categorySales(from: Date, to: Date) {
  return prisma.$queryRaw<{ category: string; revenue: number; profit: number; units: number }[]>`
    SELECT c.name AS category, SUM(si."lineTotal")::float AS revenue,
           SUM(si."lineTotal" - si."unitCost" * si.quantity)::float AS profit, SUM(si.quantity)::int AS units
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" JOIN "Medicine" m ON m.id = si."medicineId" JOIN "Category" c ON c.id = m."categoryId"
    WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
    GROUP BY c.name ORDER BY revenue DESC`
}

export async function stockValuation() {
  const today = todayDateOnly()
  const [totals] = await prisma.$queryRaw<{ cost: number; retail: number; units: number; expiredCost: number; expiredUnits: number }[]>`
    SELECT COALESCE(SUM(CASE WHEN "expiryDate" > ${today} THEN quantity * "purchasePrice" END), 0)::float AS cost,
           COALESCE(SUM(CASE WHEN "expiryDate" > ${today} THEN quantity * mrp END), 0)::float AS retail,
           COALESCE(SUM(CASE WHEN "expiryDate" > ${today} THEN quantity END), 0)::int AS units,
           COALESCE(SUM(CASE WHEN "expiryDate" <= ${today} THEN quantity * "purchasePrice" END), 0)::float AS "expiredCost",
           COALESCE(SUM(CASE WHEN "expiryDate" <= ${today} THEN quantity END), 0)::int AS "expiredUnits"
    FROM "MedicineBatch" WHERE quantity > 0`
  const byCategory = await prisma.$queryRaw<{ category: string; cost: number; retail: number; units: number; medicines: number }[]>`
    SELECT c.name AS category, COALESCE(SUM(b.quantity * b."purchasePrice"), 0)::float AS cost, COALESCE(SUM(b.quantity * b.mrp), 0)::float AS retail,
           COALESCE(SUM(b.quantity), 0)::int AS units, COUNT(DISTINCT m.id)::int AS medicines
    FROM "Category" c JOIN "Medicine" m ON m."categoryId" = c.id LEFT JOIN "MedicineBatch" b ON b."medicineId" = m.id AND b.quantity > 0 AND b."expiryDate" > ${today}
    GROUP BY c.name ORDER BY cost DESC`
  return { ...totals, byCategory }
}
