'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Clock3, Download, Plus, RefreshCw, Search, Settings, X } from 'lucide-react'
import { api, downloadCsv, fmtDate, todayISO, useApi } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, Modal, PageTitle, Status, useApp } from '../kit'

const KINDS: [string, string][] = [['ALL', 'All alerts'], ['EXPIRED', 'Expired'], ['EXPIRING_SOON', 'Expiring soon'], ['LOW_STOCK', 'Low stock'], ['OUT_OF_STOCK', 'Out of stock']]
const LABEL: Record<string, string> = { EXPIRED: 'Expired · blocked', EXPIRING_SOON: 'Expiring soon', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' }

export default function Alerts() {
  const { navigate } = useApp()
  const { data, error, loading, reload } = useApi<any>('/api/alerts')
  const [active, setActive] = useState('ALL')
  const [q, setQ] = useState('')
  const [reorder, setReorder] = useState<any | null>(null)
  const rows = useMemo(() => (data?.alerts ?? []).filter((a: any) => (active === 'ALL' || a.kind === active) && `${a.medicineName} ${a.category} ${a.batchNumber ?? ''} ${a.genericName ?? ''}`.toLowerCase().includes(q.toLowerCase())), [data, active, q])
  const detail = (a: any) => a.kind === 'EXPIRED' ? `Expired ${-a.daysRemaining} day(s) ago` : a.kind === 'EXPIRING_SOON' ? `Expires in ${a.daysRemaining} day(s) · lead time ${a.leadDays}d` : a.kind === 'LOW_STOCK' ? `${a.remaining} left · threshold ${a.threshold}` : 'Reorder required'
  const exportCsv = () => downloadCsv(`alerts-${todayISO()}.csv`, [['Alert', 'Medicine', 'Category', 'Batch', 'Remaining', 'Expiry', 'Days remaining', 'Threshold', 'On order'], ...rows.map((a: any) => [LABEL[a.kind], a.medicineName, a.category, a.batchNumber, a.remaining, a.expiryDate, a.daysRemaining, a.threshold, a.onOrder])])
  const cards: [string, string, string, React.ElementType][] = [['EXPIRED', 'Expired batches', 'red', X], ['EXPIRING_SOON', 'Expiring soon', 'amber', Clock3], ['LOW_STOCK', 'Low stock', 'orange', AlertTriangle], ['OUT_OF_STOCK', 'Out of stock', 'red', AlertTriangle]]
  return <>
    <PageTitle title="Alerts center" subtitle={data ? `Live alerts · global expiry lead time ${data.settings.expiryLeadDays} days · low-stock threshold ${data.settings.lowStockThreshold} units (per-medicine overrides applied)` : 'Monitor medicine availability, expiry, and replenishment.'}><Button variant="outline" icon={RefreshCw} loading={loading} onClick={reload}>Refresh</Button><Button variant="outline" icon={Settings} onClick={() => navigate('/settings/alerts')}>Alert settings</Button></PageTitle>
    <div className="alert-summary-grid">{cards.map(([k, l, c, Icon]) => <button className={`alert-summary-card ${active === k ? 'card-on' : ''}`} key={k} onClick={() => setActive(k)}><span className={`summary-alert-icon ${c}`}><Icon size={16} /></span><span>{l}</span><strong>{data?.counts[k] ?? '—'}</strong></button>)}</div>
    <section className="panel list-panel">
      <div className="alert-tabs">{KINDS.map(([k, l]) => <button className={active === k ? 'alert-tab-active' : ''} key={k} onClick={() => setActive(k)}>{l}<small>{k === 'ALL' ? data?.total ?? 0 : data?.counts[k] ?? 0}</small></button>)}</div>
      <div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search alerts..." value={q} onChange={e => setQ(e.target.value)} /></label><Button variant="outline" icon={Download} onClick={exportCsv}>Export</Button></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : rows.length === 0 ? <Empty icon={AlertTriangle} title="Nothing needs attention here" sub="Great — stock and expiry are healthy" /> :
        <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>CATEGORY</th><th>BATCH</th><th>REMAINING</th><th>EXPIRY DATE</th><th>ALERT</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((a: any, i: number) => <tr key={`${a.kind}-${a.medicineId}-${a.batchId}-${i}`}>
          <td><Link href={`/inventory/${a.medicineId}`} className="normal-weight invoice-link">{a.medicineName}</Link>{a.genericName && <small className="muted-sub">{a.genericName}</small>}</td>
          <td>{a.category}</td><td>{a.batchNumber || '—'}</td><td>{a.remaining} units{a.onOrder > 0 && <small className="muted-sub">{a.onOrder} on order</small>}</td>
          <td>{a.expiryDate ? <>{fmtDate(a.expiryDate)}<small className="muted-sub">{a.daysRemaining < 0 ? `${-a.daysRemaining} days ago` : `${a.daysRemaining} days left`}</small></> : '—'}</td>
          <td><div className="alert-label"><Status>{LABEL[a.kind]}</Status><small>{detail(a)}</small></div></td>
          <td className="action-cell">{a.kind === 'EXPIRED' || a.kind === 'EXPIRING_SOON' ? <>
            <button className="text-action" onClick={() => setReorder(a)}><Plus size={13} /> Add to PO</button>
            <button className="text-action" onClick={() => navigate('/supplier-returns')}><ArrowUpRight size={13} /> Return</button>
          </> : <button className="text-action" onClick={() => setReorder(a)}><Plus size={13} /> Add to Purchase Order</button>}</td></tr>)}</tbody></table></div>}
    </section>
    {reorder && <AddToPoModal alert={reorder} onClose={() => setReorder(null)} onDone={() => { setReorder(null); reload() }} />}
  </>
}

function AddToPoModal({ alert, onClose, onDone }: { alert: any; onClose: () => void; onDone: () => void }) {
  const { toast, navigate } = useApp()
  const { data: sups } = useApi<any[]>('/api/suppliers')
  const [supplierId, setSupplierId] = useState(alert.supplierId ?? '')
  const [qty, setQty] = useState<number>(alert.kind === 'LOW_STOCK' || alert.kind === 'OUT_OF_STOCK' ? alert.suggestedQty : Math.max(alert.threshold, alert.remaining))
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!supplierId) return toast('Select a supplier', 'error')
    if (!(qty > 0)) return toast('Quantity must be greater than 0', 'error')
    setBusy(true)
    try {
      const r = await api('/api/purchase-orders/quick-add', { body: { supplierId, medicineId: alert.medicineId, quantity: qty } })
      toast(`${alert.medicineName} ${r.merged ? 'quantity increased on' : 'added to'} draft ${r.poNumber}`)
      onDone()
      if (r.created) navigate(`/purchase-orders/${r.purchaseOrderId}`)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title="Add to purchase order" subtitle={`${alert.medicineName} · ${alert.remaining} units remaining${alert.onOrder ? ` · ${alert.onOrder} already on order` : ''}`} icon={Plus} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Add to draft PO</Button></>}>
    <Field label="Supplier *" hint={alert.supplierName ? `Last supplied by ${alert.supplierName}` : undefined}><select value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Select supplier</option>{sups?.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Quantity *" hint={`Suggested: ${alert.suggestedQty} (to reach 2× the ${alert.threshold}-unit threshold)`}><input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} /></Field>
    <p className="muted">The medicine is added to this supplier&apos;s open draft purchase order (a new draft is created if none exists). Review and place the order from Purchase Orders.</p>
  </Modal>
}
