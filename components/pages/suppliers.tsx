'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, CreditCard, Download, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react'
import { api, compact, downloadCsv, fmtDate, PO_LABEL, pkr, REASON_LABEL, todayISO, useApi } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, Modal, PageTitle, SmallMetric, Status, useApp, useConfirm } from '../kit'

export function Suppliers() {
  const { navigate, toast } = useApp()
  const { data, error, reload } = useApi<any[]>('/api/suppliers')
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'active' | 'all'>('active')
  const [editing, setEditing] = useState<any | null>(null)
  const rows = useMemo(() => (data ?? []).filter(s => (show === 'all' || s.active) && `${s.name} ${s.contactPerson ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q.toLowerCase())), [data, q, show])
  const open = (data ?? []).reduce((s, x) => s + x.openOrders, 0), openValue = (data ?? []).reduce((s, x) => s + x.openValue, 0), month = (data ?? []).reduce((s, x) => s + x.purchasesThisMonth, 0)
  return <>
    <PageTitle title="Suppliers" subtitle="Manage distributor relationships and purchase history."><Button variant="outline" icon={Download} onClick={() => downloadCsv(`suppliers-${todayISO()}.csv`, [['Supplier', 'Contact', 'Phone', 'Email', 'Total orders', 'Open orders', 'Active'], ...rows.map(s => [s.name, s.contactPerson, s.phone, s.email, s.totalOrders, s.openOrders, s.active ? 'Yes' : 'No'])])}>Export</Button><Button icon={Plus} onClick={() => setEditing({})}>Add supplier</Button></PageTitle>
    <div className="supplier-metrics"><SmallMetric label="Active suppliers" value={(data ?? []).filter(s => s.active).length} sub={`${data?.length ?? 0} total`} icon={Truck} /><SmallMetric label="Open purchase orders" value={open} sub={`PKR ${compact(openValue)} outstanding`} icon={ClipboardList} /><SmallMetric label="Purchases this month" value={`PKR ${compact(month)}`} sub="Stock received (at trade price)" icon={CreditCard} /></div>
    <section className="panel list-panel"><div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search suppliers..." value={q} onChange={e => setQ(e.target.value)} /></label><div className="filter-pills"><button className={show === 'active' ? 'filter-on' : ''} onClick={() => setShow('active')}>Active</button><button className={show === 'all' ? 'filter-on' : ''} onClick={() => setShow('all')}>All suppliers</button></div></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : rows.length === 0 ? <Empty icon={Truck} title="No suppliers found" /> :
        <div className="table-scroll"><table><thead><tr><th>SUPPLIER</th><th>CONTACT PERSON</th><th>PHONE</th><th>EMAIL</th><th>TOTAL ORDERS</th><th>OPEN ORDERS</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map(s => <tr key={s.id}>
          <td><Link href={`/suppliers/${s.id}`} className="supplier-cell"><span className="supplier-avatar">{s.name.split(' ').map((x: string) => x[0]).slice(0, 2).join('')}</span><strong>{s.name}</strong></Link></td><td>{s.contactPerson || '—'}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td><td>{s.totalOrders} orders</td><td>{s.openOrders}</td><td><Status>{s.active ? 'Active' : 'Inactive'}</Status></td>
          <td><button className="row-more" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil size={15} /></button></td></tr>)}</tbody></table></div>}
    </section>
    {editing && <SupplierModal sup={editing} onClose={() => setEditing(null)} onSaved={s => { setEditing(null); reload(); toast(editing.id ? 'Supplier updated' : 'Supplier added'); if (!editing.id) navigate(`/suppliers/${s.id}`) }} />}
  </>
}

function SupplierModal({ sup, onClose, onSaved }: { sup: any; onClose: () => void; onSaved: (s: any) => void }) {
  const { toast } = useApp()
  const [f, setF] = useState({ name: sup.name ?? '', contactPerson: sup.contactPerson ?? '', phone: sup.phone ?? '', email: sup.email ?? '', address: sup.address ?? '', active: sup.active ?? true })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Supplier name is required', 'error')
    setBusy(true)
    try { onSaved(await api(sup.id ? `/api/suppliers/${sup.id}` : '/api/suppliers', { method: sup.id ? 'PATCH' : 'POST', body: f })) } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title={sup.id ? 'Edit supplier' : 'Add supplier'} icon={Truck} wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save supplier</Button></>}>
    <div className="form-grid">
      <Field label="Company name *"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Contact person"><input value={f.contactPerson} onChange={e => setF({ ...f, contactPerson: e.target.value })} /></Field>
      <Field label="Phone"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Address"><input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      {sup.id && <Field label="Status"><select value={f.active ? '1' : '0'} onChange={e => setF({ ...f, active: e.target.value === '1' })}><option value="1">Active</option><option value="0">Inactive</option></select></Field>}
    </div>
  </Modal>
}

export function SupplierDetail({ id }: { id: string }) {
  const { navigate, toast } = useApp()
  const confirm = useConfirm()
  const { data: s, error, reload } = useApi<any>(`/api/suppliers/${id}`)
  const [edit, setEdit] = useState(false)
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!s) return <Loading />
  const remove = async () => {
    if (!confirm('del', 'Click again to remove (suppliers with history are deactivated)')) return
    try { const r = await api(`/api/suppliers/${id}`, { method: 'DELETE' }); toast(r.deleted ? 'Supplier deleted' : 'Supplier deactivated'); navigate('/suppliers') } catch (e: any) { toast(e.message, 'error') }
  }
  return <>
    <PageTitle title={s.name} subtitle="Supplier profile, orders, returns and stock on hand."><Button variant="outline" onClick={() => navigate('/suppliers')}>Back</Button><Button variant="outline" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button variant="outline" icon={Trash2} onClick={remove}>Remove</Button><Button icon={Plus} onClick={() => navigate(`/purchase-orders/new?supplierId=${s.id}`)}>New purchase order</Button></PageTitle>
    <div className="detail-layout"><section className="panel detail-main">
      <h3>Purchase orders</h3>
      {s.purchaseOrders.length === 0 ? <p className="muted">No orders yet.</p> : <div className="table-scroll"><table><thead><tr><th>PO</th><th>DATE</th><th>RECEIVED / ORDERED</th><th>STATUS</th></tr></thead><tbody>{s.purchaseOrders.map((p: any) => <tr key={p.id}><td><Link className="invoice-link" href={`/purchase-orders/${p.id}`}>{p.poNumber}</Link></td><td>{fmtDate(p.createdAt)}</td><td>{p.items.reduce((x: number, i: any) => x + i.quantityReceived, 0)} / {p.items.reduce((x: number, i: any) => x + i.quantityOrdered, 0)}</td><td><Status>{PO_LABEL[p.status]}</Status></td></tr>)}</tbody></table></div>}
      <h3>Stock on hand from this supplier</h3>
      {s.batches.length === 0 ? <p className="muted">No batches on hand.</p> : <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>TRADE PRICE</th></tr></thead><tbody>{s.batches.map((b: any) => <tr key={b.id}><td>{b.medicine.name}</td><td>{b.batchNumber}</td><td>{fmtDate(b.expiryDate)}</td><td>{b.quantity}</td><td>{pkr(b.purchasePrice)}</td></tr>)}</tbody></table></div>}
      <h3>Returns / debit notes</h3>
      {s.supplierReturns.length === 0 ? <p className="muted">No returns.</p> : <div className="table-scroll"><table><thead><tr><th>DEBIT NOTE</th><th>DATE</th><th>REASON</th><th>VALUE</th></tr></thead><tbody>{s.supplierReturns.map((r: any) => <tr key={r.id}><td><Link className="invoice-link" href={`/supplier-returns/${r.id}`}>{r.debitNoteNumber}</Link></td><td>{fmtDate(r.createdAt)}</td><td>{REASON_LABEL[r.reason]}</td><td className="amount-cell">{pkr(r.totalAmount)}</td></tr>)}</tbody></table></div>}
    </section>
    <aside className="panel detail-side"><h3>Contact</h3><div><span>Contact person</span><strong>{s.contactPerson || '—'}</strong></div><div><span>Phone</span><strong>{s.phone || '—'}</strong></div><div><span>Email</span><strong>{s.email || '—'}</strong></div><div><span>Address</span><strong>{s.address || '—'}</strong></div><div><span>Status</span><strong><Status>{s.active ? 'Active' : 'Inactive'}</Status></strong></div></aside></div>
    {edit && <SupplierModal sup={s} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); toast('Supplier updated') }} />}
  </>
}
