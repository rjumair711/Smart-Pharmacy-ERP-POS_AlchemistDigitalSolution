'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, BriefcaseMedical, Download, FileText, Search, ShieldCheck } from 'lucide-react'
import { api, downloadCsv, fmtDate, fmtDateTime, pkr, REASON_LABEL, todayISO, useApi } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, PageTitle, Status, useApp } from '../kit'

// ── Customer (sales) returns ────────────────────────────────────────────
export function CustomerReturns() {
  const { toast, navigate, refreshBadges } = useApp()
  const params = useSearchParams()
  const [invoice, setInvoice] = useState(params.get('invoice') ?? '')
  const [sale, setSale] = useState<any>(null)
  const [finding, setFinding] = useState(false)
  const [sel, setSel] = useState<Record<string, { qty: number; restock: boolean }>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: recent, reload } = useApi<any[]>('/api/customer-returns')

  const find = async (inv = invoice) => {
    if (!inv.trim()) return toast('Enter an invoice number', 'error')
    setFinding(true)
    try { const s = await api(`/api/sales/${encodeURIComponent(inv.trim())}`); setSale(s); setSel({}); setInvoice(s.invoiceNumber) } catch (e: any) { setSale(null); toast(e.message, 'error') } finally { setFinding(false) }
  }
  const ratio = sale && Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1
  const chosen = sale ? sale.items.filter((i: any) => sel[i.id]?.qty > 0) : []
  const refund = chosen.reduce((s: number, i: any) => s + Math.round(i.unitPrice * sel[i.id].qty * ratio * 100) / 100, 0)
  const submit = async () => {
    if (!chosen.length) return toast('Select at least one item and quantity to return', 'error')
    setBusy(true)
    try {
      const r = await api('/api/customer-returns', { body: { saleId: sale.id, reason: reason || null, items: chosen.map((i: any) => ({ saleItemId: i.id, quantity: sel[i.id].qty, restock: sel[i.id].restock })) } })
      toast(`${r.returnNumber} issued · refund ${pkr(r.refundAmount)}`)
      refreshBadges(); reload()
      navigate(`/customer-returns/${r.id}?print=1`)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return <>
    <PageTitle title="Customer returns" subtitle="Look up a sale and process a customer refund safely."><Button variant="outline" icon={Download} onClick={() => recent && downloadCsv(`customer-returns-${todayISO()}.csv`, [['Return', 'Invoice', 'Customer', 'Units', 'Refund', 'Reason', 'By', 'Date'], ...recent.map(r => [r.returnNumber, r.invoiceNumber, r.customerName, r.units, r.refundAmount, r.reason, r.processedBy, r.createdAt])])}>Export</Button></PageTitle>
    <div className="return-layout"><section className="panel return-lookup"><div className="lookup-icon"><Search size={19} /></div><h2>Find an original sale</h2><p>Search by the invoice number on the customer&apos;s receipt.</p>
      <form className="lookup-input" onSubmit={e => { e.preventDefault(); find() }}><Search size={16} /><input placeholder="e.g. INV-00042" value={invoice} onChange={e => setInvoice(e.target.value)} /><Button type="submit" loading={finding}>Find invoice</Button></form>
      {recent && recent.length > 0 && <div className="lookup-example">Recent returns: {recent.slice(0, 3).map(r => <Link key={r.id} href={`/customer-returns/${r.id}`}>{r.returnNumber}</Link>)}</div>}
    </section>
    <section className="panel return-safety"><div><ShieldCheck size={18} /><strong>Safe medicine returns</strong></div><p>Only items verified as sealed and resalable should be restocked — they go back into their <b>original batch</b>. Untick “Restock” for opened or damaged items: the customer is still refunded but the units are written off.</p></section></div>
    {sale && <section className="panel list-panel return-sale">
      <div className="panel-heading"><div><h2>{sale.invoiceNumber}</h2><p>{fmtDateTime(sale.createdAt)} · {sale.customerName || 'Walk-in customer'} · cashier {sale.cashier} · paid {pkr(sale.total)}{Number(sale.discount) > 0 ? ` (discount ${pkr(sale.discount)})` : ''}</p></div>{sale.returns.length > 0 && <Status>{`${sale.returns.length} earlier return(s)`}</Status>}</div>
      <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>SOLD</th><th>ALREADY RETURNED</th><th>RETURN QTY</th><th>RESTOCK</th><th>REFUND</th></tr></thead><tbody>{sale.items.map((i: any) => {
        const s = sel[i.id] ?? { qty: 0, restock: true }
        return <tr key={i.id} className={i.returnable === 0 ? 'row-muted' : ''}><td><strong className="normal-weight">{i.name}</strong></td><td>{i.batchNumber}<small className="muted-sub">exp {fmtDate(i.expiryDate)}</small></td><td>{i.quantity} × {pkr(i.unitPrice)}</td><td>{i.returnedQuantity}</td>
          <td>{i.returnable > 0 ? <div className="quantity-stepper"><button onClick={() => setSel({ ...sel, [i.id]: { ...s, qty: Math.max(0, s.qty - 1) } })}>−</button><input aria-label="Return quantity" value={s.qty} onChange={e => setSel({ ...sel, [i.id]: { ...s, qty: Math.min(i.returnable, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0)) } })} /><button onClick={() => setSel({ ...sel, [i.id]: { ...s, qty: Math.min(i.returnable, s.qty + 1) } })}>+</button></div> : <Status>Fully returned</Status>}</td>
          <td>{i.returnable > 0 && <input type="checkbox" checked={s.restock} onChange={e => setSel({ ...sel, [i.id]: { ...s, restock: e.target.checked } })} aria-label="Restock to original batch" />}</td>
          <td className="amount-cell">{s.qty ? pkr(Math.round(i.unitPrice * s.qty * ratio * 100) / 100) : '—'}</td></tr>
      })}</tbody></table></div>
      <div className="return-footer"><Field label="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Doctor changed prescription" /></Field><div className="refund-total"><span>Refund due</span><strong>{pkr(refund)}</strong></div><Button icon={ArrowDownRight} loading={busy} onClick={submit}>Process return & issue credit note</Button></div>
    </section>}
    <section className="panel list-panel"><div className="panel-heading"><div><h2>Recent customer returns</h2><p>Credit notes issued</p></div></div>
      {!recent ? <Loading /> : recent.length === 0 ? <Empty icon={ArrowDownRight} title="No returns yet" /> : <div className="table-scroll"><table><thead><tr><th>CREDIT NOTE</th><th>INVOICE</th><th>CUSTOMER</th><th>UNITS</th><th>REFUND</th><th>REASON</th><th>PROCESSED BY</th><th>DATE</th></tr></thead><tbody>{recent.map(r => <tr key={r.id}><td><Link className="invoice-link" href={`/customer-returns/${r.id}`}>{r.returnNumber}</Link></td><td><Link className="invoice-link" href={`/sales/${r.invoiceNumber}`}>{r.invoiceNumber}</Link></td><td>{r.customerName || 'Walk-in'}</td><td>{r.units}</td><td className="amount-cell">{pkr(r.refundAmount)}</td><td>{r.reason || '—'}</td><td>{r.processedBy}</td><td>{fmtDateTime(r.createdAt)}</td></tr>)}</tbody></table></div>}
    </section>
  </>
}

export function CreditNote({ id }: { id: string }) {
  const { navigate } = useApp()
  const { data: r, error } = useApi<any>(`/api/customer-returns/${id}`)
  useAutoPrint(!!r)
  if (error) return <ErrorBanner message={error} />
  if (!r) return <Loading />
  return <>
    <PageTitle title={`Credit note ${r.returnNumber}`} subtitle="Customer refund receipt."><Button variant="outline" onClick={() => navigate('/customer-returns')}>Back</Button><Button icon={FileText} onClick={() => window.print()}>Print</Button></PageTitle>
    <div className="receipt-paper printable"><div className="receipt-brand"><BriefcaseMedical size={22} /><strong>{r.pharmacy.name.toUpperCase()}</strong><span>{[r.pharmacy.address, r.pharmacy.phone].filter(Boolean).join(' · ')}</span></div><div className="receipt-rule" />
      <div className="receipt-meta"><span>CREDIT NOTE <strong>{r.returnNumber}</strong></span><span>{fmtDateTime(r.createdAt)}</span><span>Against invoice {r.sale.invoiceNumber} ({fmtDate(r.sale.createdAt)})</span><span>Customer: {r.sale.customerName || 'Walk-in'}</span><span>Processed by: {r.processedBy}</span></div>
      <div className="receipt-items">{r.items.map((i: any) => <div key={i.id}><strong>{i.name}</strong><span>{i.quantity} × {pkr(i.unitPrice)} · {i.batchNumber} · {i.restocked ? 'restocked' : 'written off'}</span><b>{pkr(i.refundAmount)}</b></div>)}</div>
      <div className="receipt-total"><strong>Refund issued</strong><strong>{pkr(r.refundAmount)}</strong>{r.reason && <><span>Reason</span><b>{r.reason}</b></>}</div>
      <div className="receipt-brand"><span>{r.pharmacy.footer}</span></div></div>
  </>
}

// ── Supplier (purchase) returns ───────────────────────────────────────────
export function SupplierReturns() {
  const { toast, refreshBadges, navigate } = useApp()
  const { data: sups } = useApi<any[]>('/api/suppliers')
  const [supplierId, setSupplierId] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(true)
  const { data: batches, reload: reloadBatches } = useApi<any[]>(supplierId ? `/api/batches?supplierId=${supplierId}` : null)
  const { data: history, reload } = useApi<any[]>('/api/supplier-returns')
  const [sel, setSel] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('EXPIRED')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = (batches ?? []).filter(b => !onlyFlagged || b.state !== 'Valid')
  const chosen = (batches ?? []).filter(b => sel[b.id] > 0)
  const total = chosen.reduce((s, b) => s + b.purchasePrice * sel[b.id], 0)
  const submit = async () => {
    if (!supplierId) return toast('Select a supplier', 'error')
    if (!chosen.length) return toast('Select at least one batch and quantity', 'error')
    setBusy(true)
    try {
      const r = await api('/api/supplier-returns', { body: { supplierId, reason, notes: notes || null, items: chosen.map(b => ({ batchId: b.id, quantity: sel[b.id] })) } })
      toast(`${r.debitNoteNumber} created · ${pkr(r.totalAmount)} debit`)
      setSel({}); setNotes(''); reload(); reloadBatches(); refreshBadges()
      navigate(`/supplier-returns/${r.id}`)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <>
    <PageTitle title="Supplier returns" subtitle="Return expired, near-expiry or damaged batches to the distributor. Stock is deducted and a debit note is recorded."><Button variant="outline" icon={Download} onClick={() => history && downloadCsv(`supplier-returns-${todayISO()}.csv`, [['Debit note', 'Supplier', 'Reason', 'Units', 'Value', 'By', 'Date'], ...history.map(r => [r.debitNoteNumber, r.supplier, REASON_LABEL[r.reason], r.units, r.totalAmount, r.processedBy, r.createdAt])])}>Export</Button></PageTitle>
    <section className="panel return-form"><h2>Create supplier return</h2><p>Select the supplier, then the batches and quantities to send back.</p>
      <div className="form-grid">
        <Field label="Supplier *"><select value={supplierId} onChange={e => { setSupplierId(e.target.value); setSel({}) }}><option value="">Select supplier</option>{sups?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Reason *"><select value={reason} onChange={e => setReason(e.target.value)}>{Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Notes"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Courier, RMA number, condition…" /></Field>
        <label className="field-label checkbox-label"><input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} /> Show only expired / near-expiry batches</label>
      </div>
      {supplierId && (!batches ? <Loading /> : rows.length === 0 ? <Empty icon={ArrowUpRight} title="No matching batches on hand" sub={onlyFlagged ? 'Untick the filter to see all batches (e.g. for damaged stock)' : undefined} /> :
        <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>ON HAND</th><th>TRADE PRICE</th><th>STATE</th><th>RETURN QTY</th></tr></thead><tbody>{rows.map(b => <tr key={b.id}><td><strong className="normal-weight">{b.medicineName}</strong><small className="muted-sub">{b.supplierName ?? 'No supplier recorded'}</small></td><td>{b.batchNumber}</td><td>{fmtDate(b.expiryDate)}<small className="muted-sub">{b.daysRemaining < 0 ? `${-b.daysRemaining} days ago` : `${b.daysRemaining} days`}</small></td><td>{b.quantity}</td><td>{pkr(b.purchasePrice)}</td><td><Status>{b.state}</Status></td>
          <td><div className="qty-with-all"><input className="inline-edit qty-edit" type="number" min={0} max={b.quantity} value={sel[b.id] ?? ''} placeholder="0" onChange={e => setSel({ ...sel, [b.id]: Math.min(b.quantity, Math.max(0, Number(e.target.value))) })} /><button className="text-action" onClick={() => setSel({ ...sel, [b.id]: b.quantity })}>All</button></div></td></tr>)}</tbody></table></div>)}
      <div className="stock-form-actions"><span className="refund-total"><span>Debit note value</span><strong>{pkr(total)}</strong></span><Button icon={ArrowUpRight} loading={busy} onClick={submit}>Confirm supplier return</Button></div>
    </section>
    <section className="panel list-panel"><div className="panel-heading"><div><h2>Debit notes</h2><p>Supplier return history</p></div></div>
      {!history ? <Loading /> : history.length === 0 ? <Empty icon={ArrowUpRight} title="No supplier returns yet" /> : <div className="table-scroll"><table><thead><tr><th>DEBIT NOTE</th><th>SUPPLIER</th><th>REASON</th><th>UNITS</th><th>VALUE</th><th>BY</th><th>DATE</th></tr></thead><tbody>{history.map(r => <tr key={r.id}><td><Link className="invoice-link" href={`/supplier-returns/${r.id}`}>{r.debitNoteNumber}</Link></td><td>{r.supplier}</td><td><Status>{REASON_LABEL[r.reason]}</Status></td><td>{r.units}</td><td className="amount-cell">{pkr(r.totalAmount)}</td><td>{r.processedBy}</td><td>{fmtDateTime(r.createdAt)}</td></tr>)}</tbody></table></div>}
    </section>
  </>
}

export function DebitNote({ id }: { id: string }) {
  const { navigate } = useApp()
  const { data: r, error } = useApi<any>(`/api/supplier-returns/${id}`)
  if (error) return <ErrorBanner message={error} />
  if (!r) return <Loading />
  return <>
    <PageTitle title={`Debit note ${r.debitNoteNumber}`} subtitle="Supplier / distributor return record."><Button variant="outline" onClick={() => navigate('/supplier-returns')}>Back</Button><Button icon={FileText} onClick={() => window.print()}>Print</Button></PageTitle>
    <div className="receipt-paper receipt-a4 printable"><div className="receipt-brand"><BriefcaseMedical size={22} /><strong>{r.pharmacy.name.toUpperCase()}</strong><span>{[r.pharmacy.address, r.pharmacy.phone].filter(Boolean).join(' · ')}</span></div><div className="receipt-rule" />
      <div className="receipt-meta"><span>DEBIT NOTE <strong>{r.debitNoteNumber}</strong></span><span>{fmtDateTime(r.createdAt)}</span><span>To: {r.supplier.name}{r.supplier.contactPerson ? ` (Attn: ${r.supplier.contactPerson})` : ''}</span><span>Reason: {REASON_LABEL[r.reason]}{r.notes ? ` · ${r.notes}` : ''}</span><span>Processed by: {r.processedBy}</span></div>
      <div className="receipt-items">{r.items.map((i: any) => <div key={i.id}><strong>{i.name}</strong><span>Batch {i.batchNumber} · exp {fmtDate(i.expiryDate)} · {i.quantity} × {pkr(i.unitCost)}</span><b>{pkr(i.lineTotal)}</b></div>)}</div>
      <div className="receipt-total"><strong>Total debit</strong><strong>{pkr(r.totalAmount)}</strong></div>
      <div className="signature-row"><span>Pharmacist signature</span><span>Supplier acknowledgement</span></div></div>
  </>
}

export function useAutoPrint(ready: boolean) {
  const params = useSearchParams()
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current || !params.get('print')) return
    const t = setTimeout(() => { done.current = true; window.print() }, 400)
    return () => clearTimeout(t)
  }, [ready, params])
}
