'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Blocks, Clock3, CreditCard, Download, FlaskConical, Package, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { api, downloadCsv, fmtDate, fmtDateTime, num, pkr, todayISO, useApi, useDebounced } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, Modal, PageTitle, Pagination, SmallMetric, Status, useApp, useConfirm } from '../kit'

const STATUS_FILTERS = ['All', 'In stock', 'Low stock', 'Out of stock', 'Expiring soon']

export function Inventory() {
  const { isAdmin, navigate } = useApp()
  const params = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState('All')
  const [categoryId, setCategoryId] = useState(params.get('categoryId') ?? '')
  const [page, setPage] = useState(1)
  const dq = useDebounced(query)
  useEffect(() => { setQuery(params.get('q') ?? ''); setCategoryId(params.get('categoryId') ?? '') }, [params])
  useEffect(() => setPage(1), [dq, filter, categoryId])
  const qs = `q=${encodeURIComponent(dq)}&status=${encodeURIComponent(filter)}&categoryId=${categoryId}`
  const { data, error, loading, reload } = useApi<any>(`/api/medicines?${qs}&page=${page}&pageSize=25`)
  const { data: cats } = useApi<any[]>('/api/categories')

  const exportCsv = async () => {
    const all = await api(`/api/medicines?${qs}&pageSize=500`)
    downloadCsv(`inventory-${todayISO()}.csv`, [['Medicine', 'Generic', 'Category', 'Manufacturer', 'Available', 'Batches', 'Nearest expiry', 'Retail price', 'Status'], ...all.items.map((m: any) => [m.name, m.genericName, m.category, m.manufacturer, m.stock, m.batchCount, m.nearestExpiry, m.price, m.status])])
  }
  const t = data?.totals
  return <>
    <PageTitle title={isAdmin ? 'Inventory management' : 'Stock lookup'} subtitle={isAdmin ? 'Track medicines, batches, and stock movement across your pharmacy.' : 'Check availability, batches and expiry before selling.'}>
      {isAdmin && <><Button variant="outline" icon={Sparkles} onClick={() => navigate('/ai-bill-scanner')}>Scan invoice</Button><Button variant="outline" icon={Package} onClick={() => navigate('/inventory/add-stock?tab=existing')}>Manual stock entry</Button><Button icon={Plus} onClick={() => navigate('/inventory/add-stock')}>Add medicine</Button></>}
    </PageTitle>
    <div className="inventory-kpis"><SmallMetric label="Total medicines" value={t ? num(t.medicines) : '—'} sub={t ? `Across ${t.categories} categories` : ''} icon={Package} /><SmallMetric label="Available stock" value={t ? num(t.units) : '—'} sub="Sellable units (non-expired)" icon={Blocks} /><SmallMetric label="Low stock items" value={t ? t.lowStock + t.outOfStock : '—'} sub={t ? `${t.outOfStock} out of stock` : ''} icon={AlertTriangle} tone="amber" /><SmallMetric label="Expiring soon" value={t ? t.expiringSoon : '—'} sub="Within alert lead time" icon={Clock3} tone="red" /></div>
    <section className="panel list-panel">
      <div className="panel-heading list-heading"><div><h2>Medicine inventory</h2><p>{data ? `${data.total} medicines match` : 'Loading…'}</p></div><Button variant="outline" icon={Download} onClick={exportCsv}>Export</Button></div>
      <div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search medicine, formula, batch or barcode..." value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select className="tool-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">All categories</option>{cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="filter-pills">{STATUS_FILTERS.map(x => <button key={x} className={filter === x ? 'filter-on' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <Empty icon={Package} title="No medicines found" sub="Adjust the filters or add stock" /> :
        <div className={`table-scroll ${loading ? 'is-loading' : ''}`}><table><thead><tr><th>MEDICINE</th><th>CATEGORY</th><th>MANUFACTURER</th><th>AVAILABLE</th><th>BATCHES</th><th>NEAREST EXPIRY</th><th>RETAIL PRICE</th><th>STATUS</th></tr></thead><tbody>{data.items.map((m: any) => <tr key={m.id} className="clickable" onClick={() => navigate(`/inventory/${m.id}`)}>
          <td><Link href={`/inventory/${m.id}`} className="medicine-cell"><span className="table-med-icon"><FlaskConical size={16} /></span><span><strong>{m.name}</strong><small>{m.genericName || '—'}</small></span></Link></td>
          <td>{m.category}</td><td>{m.manufacturer || '—'}</td><td className="amount-cell">{m.stock} units{m.expiredStock > 0 && <small className="warning-sub">+{m.expiredStock} expired (blocked)</small>}</td><td>{m.batchCount} batch{m.batchCount === 1 ? '' : 'es'}</td><td>{m.nearestExpiry ? <>{fmtDate(m.nearestExpiry)}<small className="muted-sub">{m.nearestExpiryDays} days</small></> : '—'}</td><td className="amount-cell">{pkr(m.price)}</td><td><Status>{m.status}</Status></td></tr>)}</tbody></table></div>}
      {data && <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} noun="medicines" />}
    </section>
  </>
}

export function MedicineDetail({ id }: { id: string }) {
  const { isAdmin, navigate, toast } = useApp()
  const { data: m, error, reload } = useApi<any>(`/api/medicines/${id}`)
  const [edit, setEdit] = useState(false)
  const confirm = useConfirm()
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!m) return <Loading />
  const remove = async () => {
    if (!confirm('delete-med', 'Click again to delete (medicines with history are deactivated)')) return
    try { const r = await api(`/api/medicines/${id}`, { method: 'DELETE' }); toast(r.deleted ? 'Medicine deleted' : 'Medicine has history — deactivated instead'); navigate('/inventory') } catch (e: any) { toast(e.message, 'error') }
  }
  const moveLabel: Record<string, string> = { PURCHASE: 'Stock received', SALE: 'Sale', CUSTOMER_RETURN: 'Customer return (restocked)', SUPPLIER_RETURN: 'Returned to supplier', ADJUSTMENT: 'Adjustment' }
  return <>
    <PageTitle title={m.name} subtitle="Batches, expiry and stock activity for this medicine."><Button variant="outline" onClick={() => navigate('/inventory')}>Back</Button>{isAdmin && <Button icon={Package} onClick={() => navigate(`/inventory/add-stock?tab=existing&medicineId=${m.id}`)}>Add stock</Button>}</PageTitle>
    <div className="detail-layout"><section className="panel detail-main">
      <div className="detail-product"><div className="medicine-icon"><FlaskConical size={22} /></div><div><div className="eyebrow">MEDICINE PROFILE · {m.category.toUpperCase()}</div><h2>{m.name}</h2><p>{[m.genericName, m.category, m.manufacturer].filter(Boolean).join(' · ')}</p></div><Status>{m.active ? m.status : 'Inactive'}</Status></div>
      <div className="detail-metrics"><SmallMetric label="Available stock" value={m.stock} sub={`Across ${m.batches.filter((b: any) => b.quantity > 0 && b.state !== 'Expired').length} valid batches`} icon={Package} /><SmallMetric label="Retail price (FEFO batch)" value={pkr(m.price)} sub={m.fefoBatch?.batchNumber ?? 'No sellable batch'} icon={CreditCard} /><SmallMetric label="Nearest expiry" value={m.nearestExpiry ? fmtDate(m.nearestExpiry) : '—'} sub={m.nearestExpiryDays !== null ? `${m.nearestExpiryDays} days remaining` : ''} icon={Clock3} /></div>
      <h3>Batch inventory</h3>
      <div className="table-scroll"><table><thead><tr><th>BATCH</th><th>SUPPLIER</th><th>RECEIVED</th><th>EXPIRY</th><th>AVAILABLE</th>{isAdmin && <th>TRADE PRICE</th>}<th>MRP</th><th>STATUS</th></tr></thead><tbody>{m.batches.length ? m.batches.map((b: any) => <tr key={b.id}><td><strong className="normal-weight">{b.batchNumber}</strong></td><td>{b.supplier || '—'}</td><td>{fmtDate(b.receivedAt)}</td><td>{fmtDate(b.expiryDate)}<small className="muted-sub">{b.daysRemaining} days</small></td><td className="amount-cell">{b.quantity} / {b.receivedQty}</td>{isAdmin && <td>{pkr(b.purchasePrice)}</td>}<td>{pkr(b.mrp)}</td><td><Status>{b.state}</Status></td></tr>) : <tr><td colSpan={8}>No batches yet</td></tr>}</tbody></table></div>
      <h3>Recent stock activity</h3>
      {m.movements.length ? m.movements.map((a: any) => <div className="activity-row" key={a.id}><span className={`activity-dot ${a.quantity > 0 ? 'green' : 'blue'}`} /><div><strong>{moveLabel[a.type]} · {Math.abs(a.quantity)} units</strong><small>Batch {a.batchNumber} · {a.reference || ''} · {fmtDateTime(a.createdAt)}</small></div><span>{a.user ? `By ${a.user.split(' ').slice(0, 2).join(' ')}` : ''}</span></div>) : <p className="muted">No activity yet.</p>}
    </section>
    <aside className="panel detail-side"><h3>Product information</h3>
      <div><span>Generic formula</span><strong>{m.genericName || '—'}</strong></div>
      <div><span>Manufacturer</span><strong>{m.manufacturer || '—'}</strong></div>
      <div><span>SKU / Barcode</span><strong>{m.barcode || '—'}</strong></div>
      <div><span>Low-stock threshold</span><strong>{m.effectiveThreshold} units{m.lowStockThreshold === null ? ' (global)' : ''}</strong></div>
      <div><span>Expiry alert lead time</span><strong>{m.effectiveLeadDays} days{m.expiryLeadDays === null ? ' (global)' : ''}</strong></div>
      {isAdmin && <><Button variant="outline" icon={Pencil} onClick={() => setEdit(true)}>Edit medicine</Button><Button variant="danger" icon={Trash2} onClick={remove}>Delete / deactivate</Button></>}
    </aside></div>
    {edit && <MedicineEditModal med={m} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); toast('Medicine updated') }} />}
  </>
}

export function MedicineEditModal({ med, onClose, onSaved }: { med: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const { data: cats } = useApi<any[]>('/api/categories')
  const [f, setF] = useState({ name: med.name, genericName: med.genericName ?? '', manufacturer: med.manufacturer ?? '', barcode: med.barcode ?? '', categoryId: med.categoryId, lowStockThreshold: med.lowStockThreshold ?? '', expiryLeadDays: med.expiryLeadDays ?? '', active: med.active })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api(`/api/medicines/${med.id}`, { method: 'PATCH', body: { ...f, lowStockThreshold: f.lowStockThreshold === '' ? null : Number(f.lowStockThreshold), expiryLeadDays: f.expiryLeadDays === '' ? null : Number(f.expiryLeadDays) } })
      onSaved()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title="Edit medicine" icon={Pencil} onClose={onClose} wide footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save changes</Button></>}>
    <div className="form-grid">
      <Field label="Medicine name *"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Generic formula"><input value={f.genericName} onChange={e => setF({ ...f, genericName: e.target.value })} /></Field>
      <Field label="Category *"><select value={f.categoryId} onChange={e => setF({ ...f, categoryId: e.target.value })}>{cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Manufacturer"><input value={f.manufacturer} onChange={e => setF({ ...f, manufacturer: e.target.value })} /></Field>
      <Field label="Barcode / SKU"><input value={f.barcode} onChange={e => setF({ ...f, barcode: e.target.value })} /></Field>
      <Field label="Status"><select value={f.active ? '1' : '0'} onChange={e => setF({ ...f, active: e.target.value === '1' })}><option value="1">Active</option><option value="0">Inactive</option></select></Field>
      <Field label="Low-stock threshold override" hint="Blank = use global default"><input type="number" min={0} value={f.lowStockThreshold} onChange={e => setF({ ...f, lowStockThreshold: e.target.value })} /></Field>
      <Field label="Expiry lead time override (days)" hint="Blank = use global default"><input type="number" min={0} value={f.expiryLeadDays} onChange={e => setF({ ...f, expiryLeadDays: e.target.value })} /></Field>
    </div>
  </Modal>
}

const emptyLine = { batchNumber: '', expiryDate: '', quantity: '', purchasePrice: '', mrp: '' }

export function StockEntry() {
  const { navigate, toast, refreshBadges } = useApp()
  const params = useSearchParams()
  const [tab, setTab] = useState<'new' | 'existing'>(params.get('tab') === 'existing' ? 'existing' : 'new')
  const { data: cats } = useApi<any[]>('/api/categories')
  const { data: sups } = useApi<any[]>('/api/suppliers')
  const { data: meds } = useApi<any>('/api/medicines?pageSize=500')
  const [supplierId, setSupplierId] = useState('')
  const { data: pos } = useApi<any>(supplierId ? `/api/purchase-orders?status=ACTIVE` : null)
  const [poId, setPoId] = useState('')
  const [medicineId, setMedicineId] = useState(params.get('medicineId') ?? '')
  const [medFilter, setMedFilter] = useState('')
  const [nm, setNm] = useState({ name: '', genericName: '', categoryId: '', manufacturer: '', lowStockThreshold: '' })
  const [line, setLine] = useState(emptyLine)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  const med = meds?.items.find((m: any) => m.id === medicineId)
  const medOptions = useMemo(() => (meds?.items ?? []).filter((m: any) => !medFilter || `${m.name} ${m.genericName}`.toLowerCase().includes(medFilter.toLowerCase())), [meds, medFilter])
  const openPos = (pos?.items ?? []).filter((p: any) => p.supplier.id === supplierId && p.status !== 'DRAFT')
  const qty = Number(line.quantity) || 0, tp = Number(line.purchasePrice) || 0, mrp = Number(line.mrp) || 0
  const margin = mrp > 0 && tp > 0 ? ((mrp - tp) / mrp) * 100 : null

  const validate = () => {
    if (tab === 'existing' && !medicineId) return 'Select a medicine'
    if (tab === 'new' && (!nm.name.trim() || !nm.categoryId)) return 'Medicine name and category are required'
    if (!supplierId) return 'Select a supplier'
    if (!line.batchNumber.trim()) return 'Batch number is required'
    if (!line.expiryDate) return 'Expiry date is required'
    if (line.expiryDate <= todayISO()) return 'Expiry date must be in the future — expired stock cannot be added for sale'
    if (qty <= 0) return 'Quantity must be greater than 0'
    if (mrp <= 0) return 'MRP is required'
    if (tp > mrp) return 'Trade price cannot exceed MRP'
    return null
  }
  const save = async (another: boolean) => {
    const err = validate()
    if (err) return toast(err, 'error')
    setBusy(true)
    try {
      const res = await api('/api/stock/receive', { body: {
        supplierId, purchaseOrderId: poId || null, reconcile: true,
        lines: [{ ...(tab === 'existing' ? { medicineId } : { newMedicine: { name: nm.name, genericName: nm.genericName || null, categoryId: nm.categoryId, manufacturer: nm.manufacturer || null, lowStockThreshold: nm.lowStockThreshold ? Number(nm.lowStockThreshold) : null } }), batchNumber: line.batchNumber, expiryDate: line.expiryDate, quantity: qty, purchasePrice: tp, mrp }],
      } })
      refreshBadges()
      const l = res.lines[0]
      const matched = l.matches.map((m: any) => `${m.poNumber} (${m.receivedTotal}/${m.ordered})`).join(', ')
      toast(`${l.quantity} units of ${l.medicineName} added${matched ? ` · matched ${matched}` : ''}`)
      if (another) { setLine(emptyLine); if (tab === 'new') setNm({ name: '', genericName: '', categoryId: nm.categoryId, manufacturer: '', lowStockThreshold: '' }) }
      else setResult(res)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return <>
    <PageTitle title="Add stock" subtitle="Add a new medicine or record a delivery for an existing one. Deliveries are matched to open purchase orders automatically."><Button variant="outline" onClick={() => navigate('/inventory')}>Back to inventory</Button></PageTitle>
    <div className="stock-entry-layout"><section className="panel stock-form">
      <div className="form-tabs">{([['new', 'New medicine + stock'], ['existing', 'Add batch to existing']] as const).map(([k, l]) => <button className={k === tab ? 'form-tab-on' : ''} key={k} onClick={() => setTab(k)}>{l}</button>)}</div>
      <h2>{tab === 'new' ? 'New medicine + stock' : 'Add batch to existing medicine'}</h2><p>Enter medicine and batch information. Fields marked * are required.</p>
      <div className="form-grid">
        {tab === 'new' ? <>
          <Field label="Medicine name *"><input placeholder="e.g. Panadol 500mg" value={nm.name} onChange={e => setNm({ ...nm, name: e.target.value })} /></Field>
          <Field label="Generic formula"><input placeholder="e.g. Paracetamol" value={nm.genericName} onChange={e => setNm({ ...nm, genericName: e.target.value })} /></Field>
          <Field label="Category *"><select value={nm.categoryId} onChange={e => setNm({ ...nm, categoryId: e.target.value })}><option value="">Select category</option>{cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Manufacturer"><input placeholder="e.g. Getz Pharma" value={nm.manufacturer} onChange={e => setNm({ ...nm, manufacturer: e.target.value })} /></Field>
        </> : <>
          <Field label="Find medicine"><input placeholder="Type to filter..." value={medFilter} onChange={e => setMedFilter(e.target.value)} /></Field>
          <Field label="Medicine *"><select value={medicineId} onChange={e => setMedicineId(e.target.value)}><option value="">Select medicine ({medOptions.length})</option>{medOptions.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.category} · {m.stock} in stock</option>)}</select></Field>
        </>}
        <Field label="Supplier *"><select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPoId('') }}><option value="">Select supplier</option>{sups?.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Link to purchase order" hint="Optional — matching is automatic"><select value={poId} onChange={e => setPoId(e.target.value)} disabled={!supplierId}><option value="">Auto-match open orders</option>{openPos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} · {p.received}/{p.ordered} received</option>)}</select></Field>
        <Field label="Batch number *"><input placeholder="e.g. PND-24150" value={line.batchNumber} onChange={e => setLine({ ...line, batchNumber: e.target.value.toUpperCase() })} /></Field>
        <Field label="Expiry date *"><input type="date" min={todayISO()} value={line.expiryDate} onChange={e => setLine({ ...line, expiryDate: e.target.value })} /></Field>
        <Field label="Received quantity *"><input type="number" min={1} placeholder="0" value={line.quantity} onChange={e => setLine({ ...line, quantity: e.target.value })} /></Field>
        <Field label="Trade price (PKR) *"><input type="number" min={0} step="0.01" placeholder="0.00" value={line.purchasePrice} onChange={e => setLine({ ...line, purchasePrice: e.target.value })} /></Field>
        <Field label="Retail price / MRP *"><input type="number" min={0} step="0.01" placeholder="0.00" value={line.mrp} onChange={e => setLine({ ...line, mrp: e.target.value })} /></Field>
        {tab === 'new' && <Field label="Low-stock threshold" hint="Blank = global default"><input type="number" min={0} placeholder="20" value={nm.lowStockThreshold} onChange={e => setNm({ ...nm, lowStockThreshold: e.target.value })} /></Field>}
      </div>
      <div className="stock-form-actions"><Button variant="outline" loading={busy} onClick={() => save(true)}>Save & add another</Button><Button loading={busy} onClick={() => save(false)}>Save stock</Button></div>
    </section>
    <aside className="panel entry-summary"><div className="summary-icon"><Package size={18} /></div><h3>Stock summary</h3><p>Your entry summary updates as you type.</p>
      <div className="summary-pair"><span>Medicine</span><b>{tab === 'new' ? nm.name || '—' : med?.name || '—'}</b></div>
      {tab === 'existing' && med && <div className="summary-pair"><span>Current stock</span><b>{med.stock} units</b></div>}
      <div className="summary-pair"><span>Batch quantity</span><b>{qty || '—'}</b></div>
      <div className="summary-pair"><span>Purchase cost</span><b>{qty && tp ? pkr(qty * tp) : '—'}</b></div>
      <div className="summary-pair"><span>Retail value</span><b>{qty && mrp ? pkr(qty * mrp) : '—'}</b></div>
      <div className="summary-pair"><span>Estimated margin</span><b>{margin !== null ? `${margin.toFixed(1)}%` : '—'}</b></div>
      <div className="summary-note"><ShieldCheck size={15} /> Stock is added only after you save. Open purchase orders for this medicine are updated automatically.</div>
    </aside></div>
    {result && <ReconcileModal result={result} onClose={() => setResult(null)} onDone={() => navigate('/inventory')} />}
  </>
}

export function ReconcileModal({ result, onClose, onDone }: { result: any; onClose: () => void; onDone: () => void }) {
  const { navigate } = useApp()
  return <Modal title="Stock added" subtitle="Purchase order reconciliation summary" icon={ShieldCheck} wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Add more stock</Button><Button onClick={onDone}>Go to inventory</Button></>}>
    <div className="reconcile-stats"><div><span>Lines added</span><strong>{result.lines.length}</strong><small>{result.lines.reduce((s: number, l: any) => s + l.quantity, 0)} units</small></div><div><span>Matched to POs</span><strong>{result.lines.filter((l: any) => l.matches.length).length}</strong><small>{result.purchaseOrders.length} order(s) updated</small></div><div><span>Unordered units</span><strong>{result.lines.reduce((s: number, l: any) => s + l.unorderedQty, 0)}</strong><small>Not on any open PO</small></div></div>
    {result.lines.map((l: any) => <div className="reconcile-line" key={l.batchId + l.medicineName}><div><strong>{l.medicineName}</strong><small>Batch {l.batchNumber} · {l.quantity} units{l.matches.length ? ' · ' + l.matches.map((m: any) => `${m.poNumber}: +${m.applied}`).join(', ') : ''}</small></div><span>{l.matches.length ? l.matches.map((m: any) => `${m.receivedTotal}/${m.ordered}`).join(', ') : '—'}</span><Status>{!l.matches.length ? 'Unordered' : l.matches.every((m: any) => m.itemStatus === 'RECEIVED') ? (l.unorderedQty ? 'Matched + extra' : 'Fully matched') : 'Partially received'}</Status></div>)}
    {result.purchaseOrders.length > 0 && <div className="po-chip-row">{result.purchaseOrders.map((p: any) => <button key={p.id} className="po-chip" onClick={() => navigate(`/purchase-orders/${p.id}`)}>{p.poNumber} · <Status>{p.status === 'RECEIVED' ? 'Received' : p.status === 'PARTIALLY_RECEIVED' ? 'Partially received' : p.status}</Status></button>)}</div>}
  </Modal>
}
