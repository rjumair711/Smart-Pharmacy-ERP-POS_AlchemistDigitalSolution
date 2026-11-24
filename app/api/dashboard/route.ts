import { route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { computeAlerts } from '@/lib/server/alerts'
import { categorySales, dailySeries, monthlySeries, periodTotals, stockValuation } from '@/lib/server/metrics'
import { localDateString, localDayStart } from '@/lib/server/util'

const DAY = 86_400_000
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const GET = route(['ADMIN'], async () => {
  const today = localDateString()
  const todayStart = localDayStart(today)
  const tomorrow = new Date(todayStart.getTime() + DAY)
  const yesterday = new Date(todayStart.getTime() - DAY)
  const ym = today.slice(0, 7)
  const monthStart = localDayStart(`${ym}-01`)
  const prevMonthStart = localDayStart(`${shiftMonth(ym, -1)}-01`)
  const dayOfMonth = Number(today.slice(8, 10))
  const prevMonthSameDay = new Date(prevMonthStart.getTime() + dayOfMonth * DAY)
  const yearStart = localDayStart(`${shiftMonth(ym, -11)}-01`)
  const thirtyAgo = new Date(tomorrow.getTime() - 30 * DAY)

  const [todayT, yesterdayT, monthT, prevMonthT, valuation, poCounts, alerts, daily, monthly, catsToday, catsMonth, recentSales, recentPos] = await Promise.all([
    periodTotals(todayStart, tomorrow),
    periodTotals(yesterday, todayStart),
    periodTotals(monthStart, tomorrow),
    periodTotals(prevMonthStart, prevMonthSameDay),
    stockValuation(),
    prisma.purchaseOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    computeAlerts(prisma),
    dailySeries(thirtyAgo, tomorrow),
    monthlySeries(yearStart, tomorrow),
    categorySales(todayStart, tomorrow),
    categorySales(monthStart, tomorrow),
    prisma.sale.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { cashier: { select: { name: true } }, items: { select: { quantity: true } } } }),
    prisma.purchaseOrder.findMany({ where: { status: { in: ['ORDERED', 'PARTIALLY_RECEIVED', 'DRAFT'] } }, orderBy: { createdAt: 'desc' }, take: 4, include: { supplier: { select: { name: true } } } }),
  ])

  // zero-fill the last 30 local days
  const byDay = new Map(daily.map(d => [d.date, d]))
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = localDateString(new Date(tomorrow.getTime() - (30 - i) * DAY + DAY / 2))
    return byDay.get(date) ?? { date, revenue: 0, profit: 0, invoices: 0 }
  })
  const byMonth = new Map(monthly.map(m => [m.month, m]))
  const months = Array.from({ length: 12 }, (_, i) => { const month = shiftMonth(ym, i - 11); return byMonth.get(month) ?? { month, revenue: 0, profit: 0 } })
  const count = (s: string) => poCounts.find(p => p.status === s)?._count._all ?? 0
  const change = (a: number, b: number) => (b > 0 ? (a - b) / b : null)

  return {
    today,
    stats: {
      todaySales: todayT.netSales, todayChange: change(todayT.netSales, yesterdayT.netSales), todayInvoices: todayT.invoices,
      monthRevenue: monthT.netSales, monthChange: change(monthT.netSales, prevMonthT.netSales),
      monthProfit: monthT.netProfit, monthMargin: monthT.margin, profitChange: change(monthT.netProfit, prevMonthT.netProfit),
      stockValue: valuation.cost, stockRetailValue: valuation.retail, stockUnits: valuation.units,
      pendingPurchaseOrders: count('ORDERED') + count('PARTIALLY_RECEIVED'), draftPurchaseOrders: count('DRAFT'),
    },
    alerts: { counts: alerts.counts, total: alerts.total, top: alerts.alerts.slice(0, 5) },
    series: { days, months },
    categories: catsToday.length ? { period: 'today', rows: catsToday } : { period: 'this month', rows: catsMonth },
    recentSales: recentSales.map(s => ({ id: s.id, invoiceNumber: s.invoiceNumber, cashier: s.cashier.name, customerName: s.customerName, items: s.items.reduce((x, i) => x + i.quantity, 0), total: s.total, paymentMethod: s.paymentMethod, createdAt: s.createdAt })),
    recentPurchaseOrders: recentPos.map(p => ({ id: p.id, poNumber: p.poNumber, supplier: p.supplier.name, status: p.status, createdAt: p.createdAt })),
  }
})
