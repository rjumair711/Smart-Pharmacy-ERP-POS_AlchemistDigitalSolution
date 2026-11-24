'use client'
import { useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, CreditCard, Download, FileText, Package, ShoppingBag } from 'lucide-react'
import { downloadCsv, fmtDate, num, pct, pkr, REASON_LABEL, todayISO, useApi } from '@/lib/client'
import { Button, ErrorBanner, Loading, PageTitle } from '../kit'
import { BarChart } from './charts'

const TABS = ['Sales analytics', 'Profitability', 'Inventory valuation', 'Purchase reports', 'Returns analysis', 'Expiry losses']
const monthStart = () => todayISO().slice(0, 8) + '01'

export default function Reports() {
  const [t, setT] = useState(TABS[0])
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayISO())
  const { data: d, error, loading, reload } = useApi<any>(`/api/reports?from=${from}&to=${to}`)
  const change = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null)
  const Delta = ({ v }: { v: number | null }) => v === null ? <span className="stat-neutral">—</span> : <span className={v >= 0 ? 'stat-positive' : 'stat-negative'}>{v >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{pct(v)}</span>

  const exportCsv = () => {
    if (!d) return
    const tables: Record<string, (string | number | null)[][]> = {
      'Sales analytics': [['Date', 'Net revenue', 'Profit', 'Invoices'], ...d.days.map((x: any) => [x.date, x.revenue, x.profit, x.invoices]), [], ['Top medicine', 'Units', 'Revenue', 'Profit'], ...d.topMedicines.map((x: any) => [x.name, x.units, x.revenue, x.profit])],
      Profitability: [['Metric', 'Value'], ['Gross sales', d.totals.revenue], ['Refunds', d.totals.refunds], ['Net sales', d.totals.netSales], ['Cost of goods sold', d.totals.cogs], ['Net profit', d.totals.netProfit], ['Margin', d.totals.margin], [], ['Category', 'Revenue', 'Profit', 'Units'], ...d.categories.map((c: any) => [c.category, c.revenue, c.profit, c.units])],
      'Inventory valuation': [['Category', 'Medicines', 'Units', 'Cost value', 'Retail value'], ...d.valuation.byCategory.map((c: any) => [c.category, c.medicines, c.units, c.cost, c.retail])],
      'Purchase reports': [['Supplier', 'Batches', 'Units', 'Value'], ...d.purchases.map((p: any) => [p.supplier, p.batches, p.units, p.value])],
      'Returns analysis': [['Credit note', 'Invoice', 'Units', 'Refund', 'Reason', 'Date'], ...d.returns.customer.rows.map((r: any) => [r.returnNumber, r.invoiceNumber, r.units, r.refundAmount, r.reason, r.createdAt]), [], ['Supplier return reason', 'Count', 'Value'], ...d.returns.supplier.map((r: any) => [REASON_LABEL[r.reason], r.count, r.value])],
      'Expiry losses': [['Medicine', 'Batch', 'Supplier', 'Expiry', 'Qty', 'Cost value'], ...d.expiry.rows.map((r: any) => [r.medicine, r.batchNumber, r.supplier, r.expiryDate, r.quantity, r.value])],
    }
    downloadCsv(`${t.toLowerCase().replace(/\s+/g, '-')}-${from}-to-${to}.csv`, tables[t])
  }

  return <>
    <PageTitle title="Reports & analytics" subtitle="Understand sales, stock health, and pharmacy performance."><div className="date-range"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} aria-label="From" /><span>–</span><input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)} aria-label="To" /></div><Button variant="outline" icon={Download} onClick={exportCsv}>Export CSV</Button><Button variant="outline" icon={FileText} onClick={() => window.print()}>Print report</Button></PageTitle>
    <div className="report-tabs">{TABS.map(x => <button className={t === x ? 'report-tab-on' : ''} onClick={() => setT(x)} key={x}>{x}</button>)}</div>
    {error ? <ErrorBanner message={error} onRetry={reload} /> : !d ? <Loading label="Building report…" /> : <div className={loading ? 'is-loading printable' : 'printable'}>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-top"><span>Net sales</span><span className="stat-icon mint"><CreditCard size={17} /></span></div><div className="stat-value">{pkr(Math.round(d.totals.netSales))}</div><div className="stat-foot"><Delta v={change(d.totals.netSales, d.previous.netSales)} /><span>vs. previous period</span></div></div>
        <div className="stat-card"><div className="stat-top"><span>Net profit</span><span className="stat-icon violet"><Activity size={17} /></span></div><div className="stat-value">{pkr(Math.round(d.totals.netProfit))}</div><div className="stat-foot"><Delta v={change(d.totals.netProfit, d.previous.netProfit)} /><span>{(d.totals.margin * 100).toFixed(1)}% margin</span></div></div>
        <div className="stat-card"><div className="stat-top"><span>Items sold</span><span className="stat-icon blue"><ShoppingBag size={17} /></span></div><div className="stat-value">{num(d.totals.unitsSold)}</div><div className="stat-foot"><Delta v={change(d.totals.unitsSold, d.previous.unitsSold)} /><span>{d.totals.invoices} invoices</span></div></div>
        <div className="stat-card"><div className="stat-top"><span>Stock valuation</span><span className="stat-icon amber"><Package size={17} /></span></div><div className="stat-value">{pkr(Math.round(d.valuation.cost))}</div><div className="stat-foot"><span className="stat-neutral">{num(d.valuation.units)} units</span><span>retail {pkr(Math.round(d.valuation.retail))}</span></div></div>
      </div>

      {(t === 'Sales analytics' || t === 'Profitability') && <div className="panel report-chart-panel"><div className="panel-heading"><div><h2>{t} overview</h2><p>Net revenue and profit · {fmtDate(d.range.from)} – {fmtDate(d.range.to)}</p></div></div><BarChart rows={d.days.map((x: any) => ({ label: x.date.slice(8), a: x.revenue, b: x.profit }))} /><div className="chart-legend"><span><i className="legend-emerald" /> Net revenue</span><span><i className="legend-muted" /> Net profit</span></div></div>}

      {t === 'Sales analytics' && <section className="panel list-panel"><h2>Top medicines</h2><Table head={['MEDICINE', 'UNITS (NET)', 'REVENUE', 'PROFIT']} rows={d.topMedicines.map((m: any) => [m.name, num(m.units), pkr(m.revenue), pkr(m.profit)])} /></section>}
      {t === 'Profitability' && <div className="report-split"><section className="panel"><h2>Profit & loss</h2>
        {[['Gross sales', d.totals.revenue], ['Discounts given', -d.totals.discount], ['Customer refunds', -d.totals.refunds], ['Net sales', d.totals.netSales], ['Cost of goods sold (net of restocked returns)', -d.totals.cogs], ['Net profit', d.totals.netProfit]].map(([l, v]) => <div className={`summary-pair ${l === 'Net profit' || l === 'Net sales' ? 'summary-strong' : ''}`} key={l as string}><span>{l}</span><b>{pkr(Math.round(Number(v)))}</b></div>)}</section>
        <section className="panel"><h2>By category</h2><Table head={['CATEGORY', 'REVENUE', 'PROFIT', 'MARGIN']} rows={d.categories.map((c: any) => [c.category, pkr(c.revenue), pkr(c.profit), c.revenue ? `${((c.profit / c.revenue) * 100).toFixed(1)}%` : '—'])} /></section></div>}
      {t === 'Inventory valuation' && <section className="panel list-panel"><h2>Valuation by category (non-expired stock)</h2><Table head={['CATEGORY', 'MEDICINES', 'UNITS', 'COST VALUE', 'RETAIL VALUE', 'POTENTIAL MARGIN']} rows={d.valuation.byCategory.map((c: any) => [c.category, c.medicines, num(c.units), pkr(c.cost), pkr(c.retail), c.retail ? `${(((c.retail - c.cost) / c.retail) * 100).toFixed(1)}%` : '—'])} /></section>}
      {t === 'Purchase reports' && <section className="panel list-panel"><h2>Stock received by supplier</h2><Table head={['SUPPLIER', 'BATCHES', 'UNITS', 'PURCHASE VALUE']} rows={d.purchases.map((p: any) => [p.supplier, p.batches, num(p.units), pkr(p.value)])} empty="No stock received in this period" /></section>}
      {t === 'Returns analysis' && <div className="report-split"><section className="panel"><h2>Customer returns</h2><div className="summary-pair"><span>Credit notes</span><b>{d.returns.customer.count}</b></div><div className="summary-pair"><span>Refunded</span><b>{pkr(d.returns.customer.refunded)}</b></div><div className="summary-pair"><span>Units written off (not restocked)</span><b>{d.returns.customer.writeOffUnits}</b></div>
        <Table head={['CREDIT NOTE', 'INVOICE', 'UNITS', 'REFUND']} rows={d.returns.customer.rows.map((r: any) => [r.returnNumber, r.invoiceNumber, r.units, pkr(r.refundAmount)])} empty="No customer returns" /></section>
        <section className="panel"><h2>Supplier returns (debit notes)</h2><Table head={['REASON', 'COUNT', 'VALUE']} rows={d.returns.supplier.map((r: any) => [REASON_LABEL[r.reason], r.count, pkr(r.value)])} empty="No supplier returns" /></section></div>}
      {t === 'Expiry losses' && <><div className="report-split"><section className="panel"><h2>Expired stock on hand</h2><div className="summary-pair summary-strong"><span>Cost value at risk</span><b>{pkr(d.expiry.expiredOnHandValue)}</b></div><div className="summary-pair"><span>Units (blocked from sale)</span><b>{d.expiry.expiredOnHandUnits}</b></div></section>
        <section className="panel"><h2>Recovered via supplier returns</h2><div className="summary-pair summary-strong"><span>Expired / near-expiry returned</span><b>{pkr(d.expiry.returnedToSuppliersValue)}</b></div><p className="muted">Return expired batches to suppliers from Supplier Returns to recover their cost.</p></section></div>
        <section className="panel list-panel"><h2>Expired batches</h2><Table head={['MEDICINE', 'BATCH', 'SUPPLIER', 'EXPIRED ON', 'QTY', 'COST VALUE']} rows={d.expiry.rows.map((r: any) => [r.medicine, r.batchNumber, r.supplier ?? '—', fmtDate(r.expiryDate), r.quantity, pkr(r.value)])} empty="No expired stock on hand" /></section></>}
      <div className="report-note"><Activity size={15} /><span><strong>Net profit methodology:</strong> Net sales (sales − customer refunds) less the recorded purchase cost of units sold, with the cost of restocked returns added back. Excludes operating expenses and overhead.</span></div>
    </div>}
  </>
}

function Table({ head, rows, empty = 'No data for this period' }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>
  return <div className="table-scroll"><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'normal-weight' : j === r.length - 1 ? 'amount-cell' : ''}>{c}</td>)}</tr>)}</tbody></table></div>
}
