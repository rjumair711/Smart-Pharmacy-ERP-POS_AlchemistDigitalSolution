'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Clock3, ClipboardList, CreditCard, Download, Package, Plus, RefreshCw, Sparkles, Truck, X } from 'lucide-react'
import { compact, downloadCsv, fmtDate, fmtTime, PAY_LABEL, PO_LABEL, pct, pkr, useApi } from '@/lib/client'
import { Button, Empty, ErrorBanner, Loading, Status, useApp } from '../kit'
import { Donut, LineChart } from './charts'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })
const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' })

export default function Dashboard() {
  const { session, navigate } = useApp()
  const { data, error, loading, reload } = useApi<any>('/api/dashboard')
  const [range, setRange] = useState<'7 days' | '30 days' | '12 months'>('7 days')
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!data) return <Loading label="Loading dashboard…" />
  const s = data.stats
  const series = range === '12 months' ? data.series.months.map((m: any) => ({ label: monthLabel(m.month), v: m.revenue })) : data.series.days.slice(range === '7 days' ? -7 : -30).map((d: any) => ({ label: dayLabel(d.date), v: d.revenue }))
  const periodTotal = series.reduce((x: number, p: any) => x + p.v, 0)
  const half = Math.floor(series.length / 2)
  const trend = half > 0 ? (() => { const a = series.slice(half).reduce((x: number, p: any) => x + p.v, 0), b = series.slice(0, half).reduce((x: number, p: any) => x + p.v, 0); return b > 0 ? (a - b) / b : null })() : null
  const catTotal = data.categories.rows.reduce((x: number, r: any) => x + r.revenue, 0)
  const stats = [
    { title: 'Today’s sales', value: pkr(s.todaySales), change: s.todayChange, caption: `${s.todayInvoices} invoices · vs. yesterday`, icon: CreditCard, color: 'mint' },
    { title: 'Monthly revenue', value: `PKR ${compact(s.monthRevenue)}`, change: s.monthChange, caption: 'vs. same period last month', icon: Activity, color: 'blue' },
    { title: 'Net profit (month)', value: pkr(Math.round(s.monthProfit)), change: s.profitChange, caption: `${(s.monthMargin * 100).toFixed(1)}% margin`, icon: ArrowUpRight, color: 'violet' },
    { title: 'Stock valuation', value: `PKR ${compact(s.stockValue)}`, change: null, caption: `${s.stockUnits.toLocaleString()} units · retail PKR ${compact(s.stockRetailValue)}`, icon: Package, color: 'amber' },
  ]
  const alertIcon = (k: string) => (k === 'EXPIRING_SOON' ? 'expiry' : k === 'LOW_STOCK' ? 'low' : 'danger')
  const alertTitle: Record<string, string> = { EXPIRED: 'Expired · blocked from sale', EXPIRING_SOON: 'Expiring soon', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' }

  const exportCsv = () => downloadCsv(`dashboard-${data.today}.csv`, [
    ['Metric', 'Value'], ['Today sales', s.todaySales], ['Month revenue', s.monthRevenue], ['Month net profit', s.monthProfit], ['Stock valuation (cost)', s.stockValue], ['Pending purchase orders', s.pendingPurchaseOrders],
    [], ['Date', 'Revenue', 'Profit', 'Invoices'], ...data.series.days.map((d: any) => [d.date, d.revenue, d.profit, d.invoices]),
  ])

  return <>
    <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>{greeting()}, {session.user.name.split(' ').slice(0, 2).join(' ')} <Sparkles className="wave" size={15} /></h1><p>Here&apos;s what&apos;s happening at your pharmacy today.</p></div><div className="title-actions"><Button variant="outline" icon={RefreshCw} loading={loading} onClick={reload}>Refresh</Button><Button variant="outline" icon={Download} onClick={exportCsv}>Export report</Button></div></div>
    <div className="quick-row"><span className="quick-label">QUICK ACTIONS</span><Button icon={Plus} onClick={() => navigate('/pos')}>New sale</Button><Button variant="outline" icon={Package} onClick={() => navigate('/inventory/add-stock')}>Add stock</Button><Button variant="outline" icon={Sparkles} onClick={() => navigate('/ai-bill-scanner')}>Scan supplier bill</Button><Button variant="outline" icon={ClipboardList} onClick={() => navigate('/purchase-orders/new')}>New purchase order</Button></div>
    <section className="stats-grid">{stats.map(st => <div className="stat-card" key={st.title}><div className="stat-top"><span>{st.title}</span><span className={`stat-icon ${st.color}`}><st.icon size={17} /></span></div><div className="stat-value">{st.value}</div><div className="stat-foot">{st.change !== null ? <span className={st.change >= 0 ? 'stat-positive' : 'stat-negative'}>{st.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {pct(st.change)}</span> : <span className="stat-neutral">—</span>}<span>{st.caption}</span></div></div>)}</section>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Sales performance</h2><p>Net revenue over time (after refunds)</p></div><div className="segmented">{(['7 days', '30 days', '12 months'] as const).map(x => <button className={range === x ? 'selected' : ''} key={x} onClick={() => setRange(x)}>{x}</button>)}</div></div>
      <div className="chart-summary"><strong>{pkr(Math.round(periodTotal))}</strong>{trend !== null && <span className={trend >= 0 ? 'stat-positive' : 'stat-negative'}>{trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {pct(trend)}</span>}<small>{trend !== null ? 'second half vs. first half of period' : 'total for period'}</small></div>
      <LineChart points={series.map((p: any) => p.v)} labels={series.map((p: any) => p.label)} ariaLabel={`Sales over the last ${range}`} />
      <div className="chart-legend"><span><i className="legend-emerald" /> Revenue</span></div></section>
      <section className="panel category-panel"><div className="panel-heading"><div><h2>Sales by category</h2><p>{data.categories.period === 'today' ? 'Today’s breakdown' : 'No sales today · showing this month'}</p></div></div><Donut rows={data.categories.rows.map((r: any) => ({ label: r.category, value: r.revenue }))} total={catTotal} caption="Total sales" /></section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel"><div className="panel-heading"><div><h2>Inventory alerts</h2><p>{data.alerts.counts.EXPIRED} expired · {data.alerts.counts.EXPIRING_SOON} expiring · {data.alerts.counts.LOW_STOCK} low · {data.alerts.counts.OUT_OF_STOCK} out of stock</p></div><Link href="/alerts" className="text-link">View all <ChevronRight size={14} /></Link></div>
        <div className="alert-list">{data.alerts.top.length ? data.alerts.top.map((a: any, i: number) => <div className="alert-line" key={i}><span className={`alert-symbol ${alertIcon(a.kind)}`}>{a.kind === 'EXPIRING_SOON' ? <Clock3 size={16} /> : a.kind === 'LOW_STOCK' ? <AlertTriangle size={16} /> : <X size={16} />}</span><div className="alert-copy"><strong>{alertTitle[a.kind]}</strong><small>{a.medicineName}{a.batchNumber ? ` · Batch ${a.batchNumber}` : ''} · {a.remaining} units</small></div><span className={`alert-date ${alertIcon(a.kind)}`}>{a.kind === 'EXPIRING_SOON' ? `${a.daysRemaining} days` : a.kind === 'EXPIRED' ? 'Return' : a.kind === 'LOW_STOCK' ? 'Reorder' : 'Urgent'}</span></div>) : <Empty icon={AlertTriangle} title="No alerts" sub="Stock and expiry are healthy" />}</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Purchase orders</h2><p>{s.pendingPurchaseOrders} pending delivery · {s.draftPurchaseOrders} draft</p></div><Link href="/purchase-orders" className="text-link">All orders <ChevronRight size={14} /></Link></div>
        <div className="mini-orders">{data.recentPurchaseOrders.length ? data.recentPurchaseOrders.map((o: any) => <Link href={`/purchase-orders/${o.id}`} className="mini-order" key={o.id}><div className="po-icon"><Truck size={16} /></div><div className="mini-order-copy"><strong>{o.poNumber}</strong><small>{o.supplier} · {fmtDate(o.createdAt)}</small></div><Status>{PO_LABEL[o.status]}</Status></Link>) : <Empty icon={Truck} title="No open purchase orders" />}</div></section>
    </div>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Recent transactions</h2><p>Your latest pharmacy sales</p></div><Link href="/sales" className="text-link">View sales history <ChevronRight size={14} /></Link></div>
      <div className="table-scroll"><table><thead><tr><th>INVOICE</th><th>CASHIER</th><th>CUSTOMER</th><th>ITEMS</th><th>PAYMENT</th><th>AMOUNT</th><th>TIME</th></tr></thead><tbody>{data.recentSales.map((t: any) => <tr key={t.id}><td><Link className="invoice-link" href={`/sales/${t.id}`}>{t.invoiceNumber}</Link></td><td>{t.cashier}</td><td>{t.customerName || 'Walk-in customer'}</td><td>{t.items} items</td><td><span className="payment-method">{PAY_LABEL[t.paymentMethod]}</span></td><td className="amount-cell">{pkr(t.total)}</td><td>{fmtDate(t.createdAt)} · {fmtTime(t.createdAt)}</td></tr>)}</tbody></table></div></section>
  </>
}
