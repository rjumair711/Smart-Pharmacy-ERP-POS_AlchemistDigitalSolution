'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Download, FileText, Plus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react'
import { api, fmtDateTime, pkr, todayISO, useApi } from '@/lib/client'
import { Button, ErrorBanner, Modal, PageTitle, Status, useApp } from '../kit'

type Row = {
  key: string; medicineId: string | null; medicineName: string; genericName: string; categoryId: string | null; categoryName: string
  batchNumber: string; expiryDate: string; quantity: number; tradePrice: number; mrp: number; confidence: number; ai: boolean
}
const STAGES = ['Reading invoice', 'Extracting medicine details', 'Identifying batches & expiry dates', 'Matching your medicine catalogue', 'Preparing verification']
const LABELS = ['Upload invoice', 'Processing', 'Verify details', 'Reconcile']
let keySeq = 0

export default function Scanner() {
  const { toast, navigate, refreshBadges } = useApp()
  const { data: sups } = useApi<any[]>('/api/suppliers')
  const { data: cats } = useApi<any[]>('/api/categories')
  const { data: meds } = useApi<any>('/api/medicines?pageSize=500')
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [header, setHeader] = useState({ supplierId: '', billNumber: '', billDate: '', totalAmount: 0, purchaseOrderId: '', model: '', fileName: '', supplierName: '' })
  const [rows, setRows] = useState<Row[]>([])
  const [raw, setRaw] = useState<unknown>(null)
  const [plan, setPlan] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: pos } = useApi<any>(header.supplierId ? '/api/purchase-orders?status=ACTIVE' : null)
  const openPos = (pos?.items ?? []).filter((p: any) => p.supplier.id === header.supplierId && p.status !== 'DRAFT')

  useEffect(() => { if (step !== 2) return; setStage(0); const t = setInterval(() => setStage(s => Math.min(STAGES.length - 1, s + 1)), 2200); return () => clearInterval(t) }, [step])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pick = (f: File | null | undefined) => {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) return toast('Choose a JPG, PNG or PDF invoice', 'error')
    if (f.size > 15 * 1024 * 1024) return toast('File is larger than 15 MB', 'error')
    setFile(f); setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null); setError(null)
  }
  const useDemo = async () => {
    const blob = await (await fetch('/demo-supplier-bill.png')).blob()
    pick(new File([blob], 'demo-supplier-bill.png', { type: 'image/png' }))
  }

  const extract = async () => {
    if (!file) return toast('Upload a supplier bill first', 'error')
    setStep(2); setError(null)
    const form = new FormData(); form.append('file', file)
    try {
      const r = await api('/api/bills/extract', { form })
      setHeader(h => ({ ...h, supplierId: h.supplierId || r.supplierId || '', supplierName: r.supplierName, billNumber: r.billNumber, billDate: r.billDate, totalAmount: r.totalAmount, model: r.model, fileName: r.fileName }))
      setRows(r.items.map((i: any) => ({ key: `r${keySeq++}`, medicineId: i.medicineId, medicineName: i.medicineId ? (meds?.items.find((m: any) => m.id === i.medicineId)?.name ?? i.medicineName) : i.medicineName, genericName: i.genericName, categoryId: i.categoryId, categoryName: i.categoryName, batchNumber: i.batchNumber, expiryDate: i.expiryDate, quantity: i.quantity, tradePrice: i.tradePrice, mrp: i.mrp, confidence: i.confidence, ai: true })))
      setRaw(r.raw)
      if (!r.items.length) toast('No medicine lines were found on this bill — add them manually below', 'error')
      setStep(3)
    } catch (e: any) { setError(e.message); setStep(1) }
  }

  const issues = (r: Row) => {
    const out: string[] = []
    if (!r.medicineName.trim()) out.push('Medicine name required')
    if (!r.medicineId && !r.categoryId) out.push('Pick a category')
    if (!r.batchNumber.trim()) out.push('Batch required')
    if (!r.expiryDate) out.push('Expiry required')
    else if (r.expiryDate <= todayISO()) out.push('Already expired')
    if (!(r.quantity > 0)) out.push('Quantity required')
    if (!(r.mrp > 0)) out.push('MRP required')
    if (r.tradePrice > r.mrp && r.mrp > 0) out.push('Trade price above MRP')
    return out
  }
  const lines = () => rows.map(r => ({ ...(r.medicineId ? { medicineId: r.medicineId } : { newMedicine: { name: r.medicineName.trim(), genericName: r.genericName || null, categoryId: r.categoryId } }), batchNumber: r.batchNumber, expiryDate: r.expiryDate, quantity: Math.round(r.quantity), purchasePrice: r.tradePrice, mrp: r.mrp }))
  const upd = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  const invoiceValue = rows.reduce((s, r) => s + r.quantity * r.tradePrice, 0)

  const toReconcile = async () => {
    if (!rows.length) return toast('Add at least one medicine line', 'error')
    if (!header.supplierId) return toast('Select the supplier for this bill', 'error')
    const bad = rows.find(r => issues(r).length)
    if (bad) return toast(`${bad.medicineName || 'A line'}: ${issues(bad).join(', ')}`, 'error')
    setBusy(true)
    try { setPlan(await api('/api/bills/preview', { body: { supplierId: header.supplierId, purchaseOrderId: header.purchaseOrderId || null, reconcile: true, lines: lines() } })); setStep(4) } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const confirm = async () => {
    setBusy(true)
    try {
      const r = await api('/api/bills', { body: { supplierId: header.supplierId, purchaseOrderId: header.purchaseOrderId || null, reconcile: true, lines: lines(), billNumber: header.billNumber || null, billDate: header.billDate || null, totalAmount: header.totalAmount || null, fileName: header.fileName || null, aiModel: header.model || null, rawExtraction: raw } })
      setResult(r); refreshBadges()
      toast(`${r.lines.length} medicines added to inventory`)
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const reset = () => { setStep(1); setFile(null); setPreview(null); setRows([]); setPlan(null); setResult(null); setHeader({ supplierId: '', billNumber: '', billDate: '', totalAmount: 0, purchaseOrderId: '', model: '', fileName: '', supplierName: '' }) }

  const matchedFull = plan?.lines.filter((l: any) => l.matches.length && l.matches.every((m: any) => m.itemStatus === 'RECEIVED') && !l.unorderedQty).length ?? 0
  const matchedPartial = plan?.lines.filter((l: any) => l.matches.some((m: any) => m.itemStatus === 'PARTIAL')).length ?? 0
  const unordered = plan?.lines.filter((l: any) => l.unorderedQty > 0).length ?? 0
  const lowConf = rows.filter(r => r.ai && r.confidence < 0.8).length

  return <>
    <PageTitle title="AI supplier bill scanner" subtitle="Upload a distributor invoice and review extracted details before adding them to stock."><Button variant="outline" icon={FileText} onClick={() => setHistory(true)}>Scan history</Button></PageTitle>
    <section className="panel scanner-panel">
      <div className="stepper">{LABELS.map((x, i) => <div className={`step-item ${step === i + 1 ? 'step-active' : ''} ${step > i + 1 ? 'step-done' : ''}`} key={x}><span>{step > i + 1 ? <Check size={15} /> : i + 1}</span><div><strong>{x}</strong><small>Step {i + 1}</small></div>{i < LABELS.length - 1 && <i />}</div>)}</div>

      {step === 1 && <div className="upload-step">
        {error && <ErrorBanner message={error} onRetry={extract} />}
        <div className="upload-illustration"><div><Sparkles size={26} /></div><span /></div>
        <h2>Upload supplier invoice</h2><p>Drag and drop your supplier bill, or browse from your device. The vision model extracts medicine, batch, expiry, quantity and prices.</p>
        <div className={`drop-zone ${file ? 'drop-has-file' : ''}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}>
          {preview ? <img src={preview} alt="Invoice preview" className="bill-thumb" /> : <div><Upload size={20} /></div>}
          <strong>{file ? file.name : 'Drop your invoice here'}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB · click to change` : 'JPG, PNG or PDF · Up to 15 MB'}</span>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={e => pick(e.target.files?.[0])} />
        </div>
        <button className="demo-invoice" onClick={useDemo}><Sparkles size={15} /> Use demo invoice <span>Loads a sample Getz Pharma bill — runs through the real AI pipeline</span></button>
        <div className="scanner-selects"><label>Supplier<select value={header.supplierId} onChange={e => setHeader({ ...header, supplierId: e.target.value, purchaseOrderId: '' })}><option value="">Auto-detect from bill</option>{sups?.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Link to purchase order <select value={header.purchaseOrderId} onChange={e => setHeader({ ...header, purchaseOrderId: e.target.value })} disabled={!header.supplierId}><option value="">Optional · auto-match open POs</option>{openPos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} · {p.supplier.name}</option>)}</select></label></div>
      </div>}

      {step === 2 && <div className="processing-step"><div className="scanner-orbit"><div><Sparkles size={27} /></div></div><h2>Reading your invoice</h2><p>The vision model is extracting medicine and batch details. This usually takes 5–20 seconds.</p><div className="processing-progress"><i /></div>
        <div className="processing-stages">{STAGES.map((x, i) => <span className={i < stage ? 'stage-complete' : ''} key={x}>{i < stage ? <Check size={14} /> : <i />}{x}</span>)}</div></div>}

      {step === 3 && <div className="verify-step">
        <div className="verify-header"><div><h2>Review extracted medicines</h2><p>AI extracted {rows.filter(r => r.ai).length} line(s){header.model ? ` with ${header.model}` : ''} · {rows.length - lowConf} high confidence, {lowConf} need review. Every cell is editable.</p></div><Status>{rows.some(r => issues(r).length) || lowConf ? 'Needs review' : 'Ready'}</Status></div>
        <div className="bill-header-grid">
          <label className="field-label">Supplier *<select value={header.supplierId} onChange={e => setHeader({ ...header, supplierId: e.target.value, purchaseOrderId: '' })}><option value="">{header.supplierName ? `Not matched: “${header.supplierName}”` : 'Select supplier'}</option>{sups?.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field-label">Bill number<input value={header.billNumber} onChange={e => setHeader({ ...header, billNumber: e.target.value })} /></label>
          <label className="field-label">Bill date<input type="date" value={header.billDate} onChange={e => setHeader({ ...header, billDate: e.target.value })} /></label>
          <label className="field-label">Purchase order<select value={header.purchaseOrderId} onChange={e => setHeader({ ...header, purchaseOrderId: e.target.value })} disabled={!header.supplierId}><option value="">Auto-match open POs</option>{openPos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber}</option>)}</select></label>
        </div>
        <div className="table-scroll"><table className="verify-table"><thead><tr><th>MEDICINE</th><th>CATEGORY</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>TRADE PRICE</th><th>MRP</th><th>CONFIDENCE</th><th /></tr></thead><tbody>{rows.map(r => {
          const iss = issues(r)
          return <tr key={r.key} className={iss.length ? 'row-warn' : ''}>
            <td><select className="inline-edit med-edit" value={r.medicineId ?? ''} onChange={e => { const m = meds?.items.find((x: any) => x.id === e.target.value); upd(r.key, m ? { medicineId: m.id, medicineName: m.name, categoryId: m.categoryId, categoryName: m.category } : { medicineId: null }) }}><option value="">➕ New: {r.medicineName || '…'}</option>{meds?.items.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              {!r.medicineId && <input className="inline-edit med-edit" placeholder="New medicine name" value={r.medicineName} onChange={e => upd(r.key, { medicineName: e.target.value })} />}
              {iss.length > 0 ? <small className="warning-sub">{iss.join(' · ')}</small> : !r.medicineId && <small className="warning-sub">Will be created as a new medicine</small>}</td>
            <td><select className="inline-edit" value={r.categoryId ?? ''} disabled={!!r.medicineId} onChange={e => upd(r.key, { categoryId: e.target.value || null })}><option value="">{r.categoryName ? `Suggested: ${r.categoryName}` : 'Category'}</option>{cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
            <td><input className="inline-edit" value={r.batchNumber} onChange={e => upd(r.key, { batchNumber: e.target.value.toUpperCase() })} /></td>
            <td><input className="inline-edit" type="date" value={r.expiryDate} onChange={e => upd(r.key, { expiryDate: e.target.value })} /></td>
            <td><input className="inline-edit qty-edit" type="number" min={1} value={r.quantity || ''} onChange={e => upd(r.key, { quantity: Number(e.target.value) })} /></td>
            <td><input className="inline-edit qty-edit" type="number" min={0} step="0.01" value={r.tradePrice || ''} onChange={e => upd(r.key, { tradePrice: Number(e.target.value) })} /></td>
            <td><input className="inline-edit qty-edit" type="number" min={0} step="0.01" value={r.mrp || ''} onChange={e => upd(r.key, { mrp: Number(e.target.value) })} /></td>
            <td>{r.ai ? <span className={`confidence ${r.confidence < 0.8 ? 'confidence-low' : ''}`}>{Math.round(r.confidence * 100)}% · {r.confidence < 0.8 ? 'Review' : 'High'}</span> : <span className="confidence">Manual</span>}</td>
            <td><button className="row-more" aria-label="Remove line" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Trash2 size={15} /></button></td>
          </tr>
        })}</tbody></table></div>
        <button className="text-action add-line" onClick={() => setRows(rs => [...rs, { key: `r${keySeq++}`, medicineId: null, medicineName: '', genericName: '', categoryId: null, categoryName: '', batchNumber: '', expiryDate: '', quantity: 0, tradePrice: 0, mrp: 0, confidence: 1, ai: false }])}><Plus size={14} /> Add line manually</button>
        <div className="verify-summary"><span><ShieldCheck size={16} /> Extracted details are unverified until you confirm.</span><strong>Invoice value <b>{pkr(invoiceValue)}</b>{header.totalAmount > 0 && Math.abs(header.totalAmount - invoiceValue) > 1 && <small className="warning-sub"> Bill total {pkr(header.totalAmount)}</small>}</strong></div>
      </div>}

      {step === 4 && plan && !result && <div className="reconcile-step">
        <div className="success-mark"><Check size={25} /></div><h2>Ready to add to stock</h2><p>Here is exactly how this bill lines up with your open purchase orders. Nothing has been saved yet.</p>
        <div className="reconcile-stats"><div><span>Fully matched</span><strong>{matchedFull} item{matchedFull === 1 ? '' : 's'}</strong><small>Ordered and received</small></div><div><span>Partially received</span><strong>{matchedPartial} item{matchedPartial === 1 ? '' : 's'}</strong><small>Backorder remains open</small></div><div><span>Unordered items</span><strong>{unordered} item{unordered === 1 ? '' : 's'}</strong><small>Not on an open purchase order</small></div></div>
        {plan.lines.map((l: any, i: number) => <div className="reconcile-line" key={i}><div><strong>{l.medicineName}</strong><small>Batch {l.batchNumber} · {l.quantity} units{l.matches.length ? ` · ${l.matches.map((m: any) => `${m.poNumber} +${m.applied}`).join(', ')}` : ''}{l.unorderedQty && l.matches.length ? ` · ${l.unorderedQty} extra` : ''}</small></div><span>{l.matches.map((m: any) => `${m.receivedTotal} / ${m.ordered}`).join(', ') || '—'}</span><Status>{!l.matches.length ? 'Unordered' : l.matches.some((m: any) => m.itemStatus === 'PARTIAL') ? 'Partially received' : 'Fully matched'}</Status></div>)}
        {plan.purchaseOrders.length > 0 && <p className="muted">Purchase orders after confirmation: {plan.purchaseOrders.map((p: any) => `${p.poNumber} → ${p.status === 'RECEIVED' ? 'Received (archived)' : 'Partially received'}`).join(' · ')}</p>}
        <div className="reconcile-total"><span>Total purchase value</span><strong>{pkr(invoiceValue)}</strong></div>
      </div>}

      {result && <div className="reconcile-step"><div className="success-mark"><Check size={25} /></div><h2>Stock added successfully</h2><p>{result.lines.reduce((s: number, l: any) => s + l.quantity, 0)} units across {result.lines.length} batch(es) are now available for FEFO sale.</p>
        {result.purchaseOrders.length > 0 && <div className="po-chip-row">{result.purchaseOrders.map((p: any) => <button key={p.id} className="po-chip" onClick={() => navigate(`/purchase-orders/${p.id}`)}>{p.poNumber} · <Status>{p.status === 'RECEIVED' ? 'Received' : 'Partially received'}</Status></button>)}</div>}
        <div className="title-actions centered"><Button variant="outline" icon={Upload} onClick={reset}>Scan another bill</Button><Button onClick={() => navigate('/inventory')}>View inventory</Button></div></div>}

      {!result && step !== 2 && <div className="scanner-footer">
        <Button variant="outline" onClick={() => step > 1 ? setStep(step === 4 ? 3 : 1) : navigate('/inventory')}>{step === 1 ? 'Cancel' : 'Back'}</Button><span>Step {step} of 4</span>
        {step === 1 && <Button onClick={extract} disabled={!file}>Extract with AI <ChevronRight size={15} /></Button>}
        {step === 3 && <Button onClick={toReconcile} loading={busy}>Continue to reconcile <ChevronRight size={15} /></Button>}
        {step === 4 && <Button onClick={confirm} loading={busy}>Confirm & add to stock <ChevronRight size={15} /></Button>}
      </div>}
    </section>
    {history && <ScanHistory onClose={() => setHistory(false)} />}
  </>
}

function ScanHistory({ onClose }: { onClose: () => void }) {
  const { data, error } = useApi<any[]>('/api/bills')
  return <Modal title="Scan history" subtitle="Supplier bills added to stock" icon={FileText} wide onClose={onClose}>
    {error ? <ErrorBanner message={error} /> : !data ? <p className="muted">Loading…</p> : data.length === 0 ? <p className="muted">No bills processed yet.</p> :
      <div className="table-scroll"><table><thead><tr><th>DATE</th><th>BILL #</th><th>SUPPLIER</th><th>BATCHES</th><th>PO MATCHES</th><th>VALUE</th><th>BY</th></tr></thead><tbody>{data.map(b => <tr key={b.id}><td>{fmtDateTime(b.createdAt)}</td><td>{b.billNumber || '—'}</td><td>{b.supplier?.name || '—'}</td><td>{b._count.batches}</td><td>{b._count.poReceipts}</td><td className="amount-cell">{pkr(b.totalAmount)}</td><td>{b.createdBy.name}</td></tr>)}</tbody></table></div>}
  </Modal>
}
