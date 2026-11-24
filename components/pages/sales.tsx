'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowDownRight, BriefcaseMedical, CreditCard, Download, FileText, Printer, Search, ShoppingBag } from 'lucide-react'
import { api, downloadCsv, fmtDate, fmtDateTime, num, PAY_LABEL, pkr, todayISO, useApi, useDebounced } from '@/lib/client'
import { Button, Empty, ErrorBanner, Loading, PageTitle, Pagination, SmallMetric, Status, useApp } from '../kit'
import { useAutoPrint } from './returns'

export function Sales() {
  const { navigate } = useApp()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  useEffect(() => setPage(1), [dq, from, to])
  const qs = `q=${encodeURIComponent(dq)}&from=${from}&to=${to}`
  const { data, error, loading, reload } = useApi<any>(`/api/sales?${qs}&page=${page}&pageSize=20`)
  const preset = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setTo(todayISO()) }
  const exportCsv = async () => {
    const all = await api(`/api/sales?${qs}&pageSize=100&page=1`)
    downloadCsv(`sales-${from}-to-${to}.csv`, [['Invoice', 'Date', 'Cashier', 'Customer', 'Units', 'Payment', 'Total', 'Status'], ...all.items.map((s: any) => [s.invoiceNumber, s.createdAt, s.cashier, s.customerName, s.itemCount, PAY_LABEL[s.paymentMethod], s.total, s.status])])
  }
  const s = data?.summary
  return <>
    <PageTitle title="Sales history" subtitle="Review transactions, receipts, and customer activity."><Button variant="outline" icon={Download} onClick={exportCsv}>Export report</Button></PageTitle>
    <div className="stats-grid compact-stats"><SmallMetric label="Transactions" value={s ? num(s.count) : '—'} sub="In selected range" icon={CreditCard} /><SmallMetric label="Revenue" value={s ? num(s.revenue) : '—'} sub="PKR · gross" icon={Activity} /><SmallMetric label="Average transaction" value={s ? num(Math.round(s.average)) : '—'} sub="PKR per invoice" icon={ShoppingBag} /><SmallMetric label="Returns" value={s ? s.returns : '—'} sub={s ? `${pkr(s.refunded)} refunded` : ''} icon={ArrowDownRight} /></div>
    <section className="panel list-panel">
      <div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search invoice, customer or phone..." value={q} onChange={e => setQ(e.target.value)} /></label>
        <div className="date-range"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} aria-label="From" /><span>–</span><input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)} aria-label="To" /></div>
        <div className="filter-pills"><button onClick={() => preset(0)}>Today</button><button onClick={() => preset(6)}>7 days</button><button onClick={() => preset(29)}>30 days</button></div></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <Empty icon={CreditCard} title="No sales in this range" /> :
        <div className={`table-scroll ${loading ? 'is-loading' : ''}`}><table><thead><tr><th>INVOICE</th><th>DATE & TIME</th><th>CASHIER</th><th>CUSTOMER</th><th>ITEMS</th><th>PAYMENT</th><th>TOTAL</th><th>STATUS</th><th /></tr></thead><tbody>{data.items.map((t: any) => <tr key={t.id} className="clickable" onClick={() => navigate(`/sales/${t.id}`)}>
          <td><Link href={`/sales/${t.id}`} className="invoice-link">{t.invoiceNumber}</Link></td><td>{fmtDateTime(t.createdAt)}</td><td>{t.cashier}</td><td>{t.customerName || 'Walk-in customer'}</td><td>{t.itemCount} items</td><td>{PAY_LABEL[t.paymentMethod]}</td><td className="amount-cell">{pkr(t.total)}</td><td><Status>{t.status}</Status></td>
          <td><Link href={`/sales/${t.id}/receipt`} className="row-more" aria-label="Receipt" onClick={e => e.stopPropagation()}><FileText size={16} /></Link></td></tr>)}</tbody></table></div>}
      {data && <Pagination page={page} pageSize={20} total={data.total} onPage={setPage} noun="transactions" />}
    </section>
  </>
}

export function SaleDetail({ id, receipt }: { id: string; receipt: boolean }) {
  const { navigate, isAdmin } = useApp()
  const { data: s, error } = useApi<any>(`/api/sales/${id}`)
  const [format, setFormat] = useState<'thermal' | 'a4' | null>(null)
  useAutoPrint(!!s && receipt)
  if (error) return <ErrorBanner message={error} />
  if (!s) return <Loading />
  const fmt = format ?? s.pharmacy.format
  const anyReturnable = s.items.some((i: any) => i.returnable > 0)
  if (receipt) return <>
    <PageTitle title={`Receipt ${s.invoiceNumber}`} subtitle="Review and print a customer receipt."><Button variant="outline" onClick={() => navigate(`/sales/${s.id}`)}>Back</Button><div className="segmented"><button className={fmt === 'thermal' ? 'selected' : ''} onClick={() => setFormat('thermal')}>Thermal 80mm</button><button className={fmt === 'a4' ? 'selected' : ''} onClick={() => setFormat('a4')}>A4</button></div><Button icon={Printer} onClick={() => window.print()}>Print</Button></PageTitle>
    <Receipt s={s} format={fmt} />
  </>
  return <>
    <PageTitle title={s.invoiceNumber} subtitle={`${fmtDateTime(s.createdAt)} · cashier ${s.cashier}`}><Button variant="outline" onClick={() => navigate('/sales')}>Back</Button>{anyReturnable && <Button variant="outline" icon={ArrowDownRight} onClick={() => navigate(`/customer-returns?invoice=${s.invoiceNumber}`)}>Return items</Button>}<Button icon={FileText} onClick={() => navigate(`/sales/${s.id}/receipt`)}>View receipt</Button></PageTitle>
    <div className="detail-layout"><section className="panel detail-main">
      <h3>Items (FEFO batch allocation)</h3>
      <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>RETURNED</th><th>UNIT PRICE</th>{isAdmin && <th>UNIT COST</th>}<th>LINE TOTAL</th></tr></thead><tbody>{s.items.map((i: any) => <tr key={i.id}><td><strong className="normal-weight">{i.name}</strong></td><td>{i.batchNumber}</td><td>{fmtDate(i.expiryDate)}</td><td>{i.quantity}</td><td>{i.returnedQuantity || '—'}</td><td>{pkr(i.unitPrice)}</td>{isAdmin && <td>{pkr(i.unitCost)}</td>}<td className="amount-cell">{pkr(i.lineTotal)}</td></tr>)}</tbody></table></div>
      {s.returns.length > 0 && <><h3>Returns</h3>{s.returns.map((r: any) => <div className="activity-row" key={r.id}><span className="activity-dot blue" /><div><strong><Link className="invoice-link" href={`/customer-returns/${r.id}`}>{r.returnNumber}</Link> · refund {pkr(r.refundAmount)}</strong><small>{fmtDateTime(r.createdAt)}</small></div><span>By {r.processedBy}</span></div>)}</>}
    </section>
    <aside className="panel detail-side"><h3>Payment</h3>
      <div><span>Customer</span><strong>{s.customerName || 'Walk-in customer'}{s.customerPhone ? ` · ${s.customerPhone}` : ''}</strong></div>
      <div><span>Method</span><strong>{PAY_LABEL[s.paymentMethod]}</strong></div>
      <div><span>Subtotal</span><strong>{pkr(s.subtotal)}</strong></div><div><span>Discount</span><strong>− {pkr(s.discount)}</strong></div><div><span>Tax</span><strong>{pkr(s.tax)}</strong></div><div><span>Total paid</span><strong>{pkr(s.total)}</strong></div>
      {isAdmin && s.costTotal !== undefined && <div><span>Gross profit</span><strong>{pkr(Number(s.total) - Number(s.costTotal))}</strong></div>}
    </aside></div>
  </>
}

export function Receipt({ s, format }: { s: any; format: string }) {
  return <div className={`receipt-paper printable ${format === 'a4' ? 'receipt-a4' : 'receipt-thermal'}`}>
    <div className="receipt-brand"><BriefcaseMedical size={22} /><strong>{s.pharmacy.name.toUpperCase()}</strong><span>{[s.pharmacy.address, s.pharmacy.phone].filter(Boolean).join(' · ')}</span></div><div className="receipt-rule" />
    <div className="receipt-meta"><span>Invoice <strong>{s.invoiceNumber}</strong></span><span>{fmtDateTime(s.createdAt)}</span><span>Cashier: {s.cashier}</span>{s.customerName && <span>Customer: {s.customerName}{s.customerPhone ? ` · ${s.customerPhone}` : ''}</span>}<span>Payment: {PAY_LABEL[s.paymentMethod]}</span></div>
    <div className="receipt-items">{s.items.map((i: any) => <div key={i.id}><strong>{i.name}</strong><span>{i.quantity} × {pkr(i.unitPrice)} · Batch {i.batchNumber} · Exp {fmtDate(i.expiryDate)}</span><b>{pkr(i.lineTotal)}</b></div>)}</div>
    <div className="receipt-total"><span>Subtotal</span><b>{pkr(s.subtotal)}</b><span>Discount</span><b>− {pkr(s.discount)}</b><span>Tax ({Number(s.pharmacy.taxRate)}%)</span><b>{pkr(s.tax)}</b><strong>Total paid</strong><strong>{pkr(s.total)}</strong></div>
    {s.returns.length > 0 && <div className="receipt-meta"><span>Returns: {s.returns.map((r: any) => `${r.returnNumber} (${pkr(r.refundAmount)})`).join(', ')}</span></div>}
    <div className="receipt-brand"><span>{s.pharmacy.footer}</span><span className="receipt-small">Medicines once sold are returnable only if sealed, with this receipt.</span></div>
  </div>
}
