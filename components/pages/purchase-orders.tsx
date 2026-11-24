'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Ban, Check, ClipboardList, Download, FileText, Plus, Search, Send, Trash2, Truck } from 'lucide-react'
import { api, downloadCsv, fmtDate, fmtDateTime, PO_LABEL, pkr, todayISO, useApi, useDebounced } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, PageTitle, Status, useApp, useConfirm } from '../kit'

const TABS: [string, string][] = [['ACTIVE', 'Open orders'], ['DRAFT', 'Draft'], ['ORDERED', 'Ordered'], ['PARTIALLY_RECEIVED', 'Partially received'], ['ARCHIVED', 'Completed / archived'], ['ALL', 'All']]
const DOT: Record<string, string> = { DRAFT: 'slate', ORDERED: 'blue', PARTIALLY_RECEIVED: 'amber', RECEIVED: 'green', CANCELLED: 'red' }

export function PurchaseOrders() {
  const { navigate } = useApp()
  const [tab, setTab] = useState('ACTIVE')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi<any>(`/api/purchase-orders?status=${tab}&q=${encodeURIComponent(dq)}`)
  const exportCsv = () => data && downloadCsv(`purchase-orders-${todayISO()}.csv`, [['PO', 'Supplier', 'Created', 'Ordered at', 'Items', 'Received', 'Ordered', 'Estimated total', 'Status', 'Received at'], ...data.items.map((o: any) => [o.poNumber, o.supplier.name, o.createdAt, o.orderedAt, o.itemCount, o.received, o.ordered, o.amount, PO_LABEL[o.status], o.receivedAt])])
  return <>
    <PageTitle title="Purchase orders" subtitle="Track supplier orders. Deliveries entered manually or via the AI bill scanner are matched automatically."><Button variant="outline" icon={Download} onClick={exportCsv}>Export</Button><Button icon={Plus} onClick={() => navigate('/purchase-orders/new')}>Create purchase order</Button></PageTitle>
    <div className="order-status-grid">{Object.entries(PO_LABEL).map(([k, l]) => <button className={`order-status-card ${tab === k ? 'card-on' : ''}`} key={k} onClick={() => setTab(k)}><span className={`order-status-dot ${DOT[k]}`} /><small>{l}</small><strong>{data?.counts?.[k] ?? '—'}</strong></button>)}</div>
    <section className="panel list-panel">
      <div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search PO number, supplier or medicine..." value={q} onChange={e => setQ(e.target.value)} /></label><div className="filter-pills">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'filter-on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <Empty icon={ClipboardList} title="No purchase orders here" sub={tab === 'ACTIVE' ? 'All orders are received — nice!' : 'Try another filter'} /> :
        <div className={`table-scroll ${loading ? 'is-loading' : ''}`}><table><thead><tr><th>PO NUMBER</th><th>SUPPLIER</th><th>ORDER DATE</th><th>MEDICINES</th><th>RECEIVED / ORDERED</th><th>ESTIMATED TOTAL</th><th>STATUS</th></tr></thead><tbody>{data.items.map((o: any) => <tr key={o.id} className="clickable" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
          <td><Link className="invoice-link" href={`/purchase-orders/${o.id}`}>{o.poNumber}</Link></td><td><strong className="normal-weight">{o.supplier.name}</strong></td><td>{fmtDate(o.orderedAt ?? o.createdAt)}</td><td>{o.itemCount} items</td>
          <td><div className="progress-cell"><span>{o.received} / {o.ordered}</span><i><b style={{ width: `${o.ordered ? (o.received / o.ordered) * 100 : 0}%` }} /></i></div></td>
          <td className="amount-cell">{pkr(o.amount)}</td><td><div className="alert-label"><Status>{PO_LABEL[o.status]}</Status>{o.receivedAt && <small>Received {fmtDate(o.receivedAt)}</small>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="info-banner"><div><Truck size={18} /></div><span><strong>Receiving a supplier delivery?</strong> Scan your invoice to automatically match items against open purchase orders.</span><Button variant="outline" onClick={() => navigate('/ai-bill-scanner')}>Upload supplier bill</Button></div>
  </>
}

type PoLine = { medicineId: string; quantity: number; unitCost: number | '' }

export function NewPurchaseOrder() {
  const { navigate, toast } = useApp()
  const params = useSearchParams()
  const { data: sups } = useApi<any[]>('/api/suppliers')
  const { data: meds } = useApi<any>('/api/medicines?pageSize=500')
  const { data: alerts } = useApi<any>('/api/alerts')
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PoLine[]>(params.get('medicineId') ? [{ medicineId: params.get('medicineId')!, quantity: Number(params.get('qty')) || 1, unitCost: '' }] : [{ medicineId: '', quantity: 1, unitCost: '' }])
  const [busy, setBusy] = useState<'' | 'DRAFT' | 'ORDERED'>('')
  const suggestions = useMemo(() => (alerts?.alerts ?? []).filter((a: any) => (a.kind === 'LOW_STOCK' || a.kind === 'OUT_OF_STOCK') && (!supplierId || a.supplierId === supplierId || !a.supplierId) && !lines.some(l => l.medicineId === a.medicineId)), [alerts, supplierId, lines])
  const total = lines.reduce((s, l) => s + (Number(l.unitCost) || 0) * l.quantity, 0)
  const set = (i: number, p: Partial<PoLine>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...p } : l))
  const save = async (status: 'DRAFT' | 'ORDERED') => {
    if (!supplierId) return toast('Select a supplier', 'error')
    const valid = lines.filter(l => l.medicineId)
    if (!valid.length) return toast('Add at least one medicine', 'error')
    if (valid.some(l => !(l.quantity > 0))) return toast('Every quantity must be greater than 0', 'error')
    setBusy(status)
    try {
      const po = await api('/api/purchase-orders', { body: { supplierId, notes: notes || null, status, items: valid.map(l => ({ medicineId: l.medicineId, quantity: l.quantity, unitCost: l.unitCost === '' ? null : Number(l.unitCost) })) } })
      toast(`${po.poNumber} ${status === 'DRAFT' ? 'saved as draft' : 'placed — status: Ordered'}`)
      navigate(`/purchase-orders/${po.id}`)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy('') }
  }
  return <>
    <PageTitle title="Create purchase order" subtitle="Select a supplier and the medicines you need. Placed orders are marked Ordered until stock arrives."><Button variant="outline" onClick={() => navigate('/purchase-orders')}>Cancel</Button></PageTitle>
    <div className="stock-entry-layout"><section className="panel stock-form">
      <div className="form-grid"><Field label="Supplier *"><select value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Select supplier</option>{sups?.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Notes"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery instructions, terms…" /></Field></div>
      <h3 className="section-h">Medicines</h3>
      <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>IN STOCK</th><th>QUANTITY</th><th>UNIT COST (OPTIONAL)</th><th>LINE TOTAL</th><th /></tr></thead><tbody>{lines.map((l, i) => {
        const m = meds?.items.find((x: any) => x.id === l.medicineId)
        return <tr key={i}><td><select className="inline-edit med-edit" value={l.medicineId} onChange={e => set(i, { medicineId: e.target.value })}><option value="">Select medicine</option>{meds?.items.map((x: any) => <option key={x.id} value={x.id} disabled={lines.some((o, j) => j !== i && o.medicineId === x.id)}>{x.name} · {x.category}</option>)}</select></td>
          <td>{m ? <>{m.stock} <Status>{m.status}</Status></> : '—'}</td>
          <td><input className="inline-edit qty-edit" type="number" min={1} value={l.quantity} onChange={e => set(i, { quantity: Math.max(0, Number(e.target.value)) })} /></td>
          <td><input className="inline-edit qty-edit" type="number" min={0} step="0.01" value={l.unitCost} onChange={e => set(i, { unitCost: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
          <td className="amount-cell">{l.unitCost !== '' ? pkr(Number(l.unitCost) * l.quantity) : '—'}</td>
          <td><button className="row-more" aria-label="Remove" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ medicineId: '', quantity: 1, unitCost: '' }])}><Trash2 size={15} /></button></td></tr>
      })}</tbody></table></div>
      <button className="text-action add-line" onClick={() => setLines(ls => [...ls, { medicineId: '', quantity: 1, unitCost: '' }])}><Plus size={14} /> Add medicine</button>
      <div className="stock-form-actions"><Button variant="outline" loading={busy === 'DRAFT'} onClick={() => save('DRAFT')}>Save as draft</Button><Button icon={Send} loading={busy === 'ORDERED'} onClick={() => save('ORDERED')}>Place order</Button></div>
    </section>
    <aside className="panel entry-summary"><div className="summary-icon"><AlertTriangle size={18} /></div><h3>Reorder suggestions</h3><p>Low-stock and out-of-stock medicines{supplierId ? ' from this supplier' : ''}.</p>
      {suggestions.length === 0 ? <p className="muted">No suggestions right now.</p> : suggestions.slice(0, 8).map((a: any) => <div className="summary-pair suggestion" key={a.medicineId}><span>{a.medicineName}<small>{a.remaining} left · {a.onOrder ? `${a.onOrder} on order` : 'none on order'}</small></span><button className="text-action" onClick={() => setLines(ls => [...ls.filter(l => l.medicineId), { medicineId: a.medicineId, quantity: a.suggestedQty, unitCost: '' }])}>+ {a.suggestedQty}</button></div>)}
      <div className="summary-pair"><span>Estimated total</span><b>{pkr(total)}</b></div>
    </aside></div>
  </>
}

export function PurchaseOrderDetail({ id }: { id: string }) {
  const { navigate, toast } = useApp()
  const confirm = useConfirm()
  const { data: po, error, reload, setData } = useApi<any>(`/api/purchase-orders/${id}`)
  const [busy, setBusy] = useState('')
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!po) return <Loading />
  const act = async (action: string, msg: string) => {
    if (action !== 'order' && !confirm(action, `Click again to ${action === 'close' ? 'close this order and drop the backorder' : 'cancel this order'}`)) return
    setBusy(action)
    try { setData(await api(`/api/purchase-orders/${po.id}`, { method: 'PATCH', body: { action } })); toast(msg) } catch (e: any) { toast(e.message, 'error') } finally { setBusy('') }
  }
  const del = async () => {
    if (!confirm('delete', 'Click again to delete this draft')) return
    try { await api(`/api/purchase-orders/${po.id}`, { method: 'DELETE' }); toast('Draft deleted'); navigate('/purchase-orders') } catch (e: any) { toast(e.message, 'error') }
  }
  const backorder = po.items.reduce((s: number, i: any) => s + Math.max(0, i.quantityOrdered - i.quantityReceived), 0)
  return <>
    <PageTitle title={po.poNumber} subtitle={`${po.supplier.name} · created ${fmtDate(po.createdAt)} by ${po.createdBy}`}>
      <Button variant="outline" onClick={() => navigate('/purchase-orders')}>Back</Button>
      <Button variant="outline" icon={FileText} onClick={() => window.print()}>Print</Button>
      {po.status === 'DRAFT' && <><Button variant="outline" icon={Trash2} onClick={del}>Delete draft</Button><Button icon={Send} loading={busy === 'order'} onClick={() => act('order', 'Order placed — status: Ordered')}>Place order</Button></>}
      {po.status === 'ORDERED' && <Button variant="outline" icon={Ban} loading={busy === 'cancel'} onClick={() => act('cancel', 'Order cancelled')}>Cancel order</Button>}
      {po.status === 'PARTIALLY_RECEIVED' && <Button variant="outline" icon={Check} loading={busy === 'close'} onClick={() => act('close', 'Order closed')}>Close (drop backorder)</Button>}
      {(po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && <Button icon={Truck} onClick={() => navigate('/ai-bill-scanner')}>Receive via bill</Button>}
    </PageTitle>
    <div className="detail-layout"><section className="panel detail-main printable">
      <div className="detail-product"><div className="medicine-icon"><ClipboardList size={22} /></div><div><div className="eyebrow">PURCHASE ORDER</div><h2>{po.poNumber}</h2><p>{po.supplier.name}{po.orderedAt ? ` · ordered ${fmtDateTime(po.orderedAt)}` : ' · not yet placed'}</p></div><div className="alert-label"><Status>{PO_LABEL[po.status]}</Status>{po.receivedAt && <small>Received {fmtDateTime(po.receivedAt)}</small>}</div></div>
      <div className="detail-metrics"><div className="small-metric"><div><small>Received / ordered</small><strong>{po.received} / {po.ordered}</strong><span>{backorder ? `${backorder} units on backorder` : 'Nothing outstanding'}</span></div></div><div className="small-metric"><div><small>Estimated total</small><strong>{pkr(po.amount)}</strong><span>{po.itemCount} medicines</span></div></div><div className="small-metric"><div><small>Notes</small><strong className="note-text">{po.notes || '—'}</strong></div></div></div>
      <h3>Order lines</h3>
      <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>CATEGORY</th><th>ORDERED</th><th>RECEIVED</th><th>UNIT COST</th><th>STATUS</th><th>RECEIVED VIA</th></tr></thead><tbody>{po.items.map((i: any) => <tr key={i.id}>
        <td><Link href={`/inventory/${i.medicine.id}`} className="normal-weight invoice-link">{i.medicine.name}</Link></td><td>{i.medicine.category.name}</td><td>{i.quantityOrdered}</td>
        <td><div className="progress-cell"><span>{i.quantityReceived}</span><i><b style={{ width: `${Math.min(100, (i.quantityReceived / i.quantityOrdered) * 100)}%` }} /></i></div></td>
        <td>{i.unitCost !== null ? pkr(i.unitCost) : '—'}</td>
        <td><div className="alert-label"><Status>{i.status === 'RECEIVED' ? 'Received / Added' : i.status === 'PARTIAL' ? `Partial · ${i.quantityOrdered - i.quantityReceived} backordered` : po.status === 'DRAFT' ? 'Draft' : 'Ordered'}</Status>{i.lastReceivedAt && <small>{fmtDateTime(i.lastReceivedAt)}</small>}</div></td>
        <td>{i.receipts.length ? i.receipts.map((r: any) => <small key={r.id} className="receipt-ref">{r.batch.batchNumber} · {r.quantity} units{r.supplierBill?.billNumber ? ` · bill ${r.supplierBill.billNumber}` : ''}</small>) : '—'}</td></tr>)}</tbody></table></div>
    </section>
    <aside className="panel detail-side"><h3>Supplier</h3><div><span>Name</span><strong>{po.supplier.name}</strong></div><div><span>Contact</span><strong>{po.supplier.contactPerson || '—'}</strong></div><div><span>Phone</span><strong>{po.supplier.phone || '—'}</strong></div><div><span>Email</span><strong>{po.supplier.email || '—'}</strong></div><Button variant="outline" onClick={() => navigate(`/suppliers/${po.supplier.id}`)}>Supplier profile</Button></aside></div>
  </>
}
