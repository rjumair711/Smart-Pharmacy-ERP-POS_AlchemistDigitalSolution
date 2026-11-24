'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CreditCard, FileText, FlaskConical, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { api, fmtDate, pkr, useApi, useDebounced } from '@/lib/client'
import { Button, ErrorBanner, Loading, Modal, useApp } from '../kit'

type Med = { id: string; name: string; genericName: string | null; category: string; categoryId: string; stock: number; price: number; fefoBatch: { batchNumber: string; expiryDate: string; quantity: number; mrp: number } | null; expiredStock: number }
type Line = { medicineId: string; name: string; qty: number; price: number; stock: number; batch: string; expiry: string; firstBatchQty: number }

export default function POS() {
  const { session, toast, navigate, refreshBadges } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const dq = useDebounced(query, 200)
  const { data: cats } = useApi<any[]>('/api/categories')
  const { data: settings } = useApi<any>('/api/settings')
  const { data, error, loading, reload } = useApi<{ items: Med[] }>(`/api/medicines?pageSize=500${dq ? `&q=${encodeURIComponent(dq)}` : ''}${category !== 'All' ? `&categoryId=${category}` : ''}`)
  const [cart, setCart] = useState<Line[]>([])
  const [customer, setCustomer] = useState({ name: '', phone: '' })
  const [discount, setDiscount] = useState(0)
  const [showDiscount, setShowDiscount] = useState(false)
  const [payment, setPayment] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ id: string; invoiceNumber: string; total: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0)
  const taxRate = Number(settings?.taxRate ?? 0)
  const disc = Math.min(discount, subtotal)
  const tax = Math.round((subtotal - disc) * taxRate) / 100
  const total = Math.round((subtotal - disc + tax) * 100) / 100
  const change = payment === 'CASH' && Number(tendered) > 0 ? Number(tendered) - total : null

  const add = (m: Med) => {
    if (m.stock < 1) return toast(m.expiredStock ? `${m.name}: only expired stock left — blocked from sale` : `${m.name} is out of stock`, 'error')
    const inCart = cart.find(i => i.medicineId === m.id)
    if (inCart && inCart.qty >= m.stock) return toast(`Only ${m.stock} units of ${m.name} available`, 'error')
    setCart(c => inCart ? c.map(i => i.medicineId === m.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { medicineId: m.id, name: m.name, qty: 1, price: m.price, stock: m.stock, batch: m.fefoBatch!.batchNumber, expiry: m.fefoBatch!.expiryDate, firstBatchQty: m.fefoBatch!.quantity }])
  }
  const setQty = (id: string, qty: number) => setCart(c => c.map(i => i.medicineId === id ? { ...i, qty: Math.max(1, Math.min(i.stock, qty || 1)) } : i))
  const clear = () => { setCart([]); setDiscount(0); setCustomer({ name: '', phone: '' }); setTendered('') }

  const checkout = useCallback(async () => {
    if (!cart.length) return toast('Add an item to the bill first', 'error')
    if (change !== null && change < 0) return toast('Cash tendered is less than the total due', 'error')
    setBusy(true)
    try {
      const res = await api('/api/sales', { body: { items: cart.map(i => ({ medicineId: i.medicineId, quantity: i.qty })), customerName: customer.name || null, customerPhone: customer.phone || null, paymentMethod: payment, discount: disc } })
      setDone(res)
      clear()
      reload()
      refreshBadges()
    } catch (e: any) {
      toast(e.message, 'error')
      reload()
    } finally { setBusy(false) }
  }, [cart, change, customer, payment, disc, toast, reload, refreshBadges])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'F4') { e.preventDefault(); if (!busy) checkout() }
      else if (e.key === 'Escape' && !done && document.activeElement === searchRef.current) { setQuery('') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [checkout, busy, done])

  const items = data?.items ?? []
  const onSearchEnter = () => { // barcode scanners type the code + Enter: add exact/only match directly
    const exact = items.find(m => (m as any).barcode === query.trim()) ?? (items.length === 1 ? items[0] : null)
    if (exact) { add(exact); setQuery('') }
  }
  const catChips = useMemo(() => [{ id: 'All', name: 'All' }, ...(cats ?? []).filter(c => c.medicineCount > 0)], [cats])

  return <>
    <div className="pos-heading"><div><div className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>New sale</h1><p>Cashier: {session.user.name} <span className="cashier-dot" /> FEFO batch allocation enabled</p></div><div className="invoice-chip"><span>INVOICE NUMBER</span><strong>Assigned on completion</strong><button onClick={() => navigate('/sales')}>History</button></div></div>
    <div className="pos-layout">
      <section className="pos-products">
        <div className="pos-search"><Search size={19} /><input ref={searchRef} autoFocus placeholder="Search medicine, generic formula, batch or scan barcode..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearchEnter() }} /><kbd>F2</kbd></div>
        <div className="category-chips">{catChips.map(c => <button key={c.id} onClick={() => setCategory(c.id)} className={category === c.id ? 'chip-active' : ''}>{c.name}</button>)}</div>
        {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : items.length === 0 ? <div className="cart-empty"><div><Search size={23} /></div><strong>No medicines match “{query}”</strong><span>Try a brand name, generic formula or category</span></div> :
          <div className={`product-grid ${loading ? 'is-loading' : ''}`}>{items.map(m => {
            const inCart = cart.find(i => i.medicineId === m.id)?.qty ?? 0
            return <button disabled={m.stock === 0} onClick={() => add(m)} className={`product-card ${m.stock === 0 ? 'product-disabled' : ''}`} key={m.id}>
              <div className="product-top"><div className="medicine-icon"><FlaskConical size={18} /></div><span className={m.stock < 20 ? 'stock-warning' : ''}>{m.stock - inCart} units</span></div>
              <strong>{m.name}</strong><small>{m.genericName || '—'}</small>
              {m.fefoBatch && <small className="fefo-hint">FEFO · {m.fefoBatch.batchNumber} · exp {fmtDate(m.fefoBatch.expiryDate)}</small>}
              <div className="product-bottom"><span>{m.category}</span><b>{pkr(m.price)}</b></div>
              {m.stock === 0 && <span className="out-overlay">{m.expiredStock ? 'Expired · blocked' : 'Out of stock'}</span>}
            </button>
          })}</div>}
      </section>
      <aside className="bill-panel">
        <div className="bill-heading"><div><h2>Current bill</h2><span>{cart.length} items in cart</span></div><button onClick={clear} className="clear-button">Clear all</button></div>
        <div className="customer-fields"><input placeholder="Customer name (optional)" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} /><input placeholder="Phone number (optional)" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} /></div>
        <div className="cart-lines">{cart.length === 0 ? <div className="cart-empty"><div><ShoppingBag size={23} /></div><strong>Your bill is empty</strong><span>Search and add medicines to get started</span></div> : cart.map(item => <div className="cart-line" key={item.medicineId}>
          <div className="cart-line-main"><div><strong>{item.name}</strong><small>{item.batch} · exp. {fmtDate(item.expiry)}</small></div><button className="remove-line" aria-label={`Remove ${item.name}`} onClick={() => setCart(c => c.filter(x => x.medicineId !== item.medicineId))}><X size={15} /></button></div>
          <div className="cart-line-bottom"><div className="quantity-stepper"><button onClick={() => setQty(item.medicineId, item.qty - 1)}>−</button><input aria-label="Quantity" value={item.qty} onChange={e => setQty(item.medicineId, Number(e.target.value.replace(/\D/g, '')))} /><button onClick={() => item.qty >= item.stock ? toast(`Only ${item.stock} units available`, 'error') : setQty(item.medicineId, item.qty + 1)}>+</button></div><b>{pkr(item.price * item.qty)}</b></div>
          <details className="fefo-details"><summary><Check size={13} /> FEFO batch allocation</summary><span>{item.qty <= item.firstBatchQty ? `${item.qty} unit${item.qty > 1 ? 's' : ''} from ${item.batch} · earliest valid expiry` : `${item.firstBatchQty} from ${item.batch}, ${item.qty - item.firstBatchQty} from the next-earliest batch (final price per batch MRP)`}</span></details>
        </div>)}</div>
        <div className="bill-summary">
          <div><span>Subtotal</span><b>{pkr(subtotal)}</b></div>
          <div><span>Discount <button className="add-discount" onClick={() => setShowDiscount(s => !s)}>{showDiscount ? 'Hide' : disc ? 'Edit' : 'Add'}</button></span><b>− {pkr(disc)}</b></div>
          {showDiscount && <div className="discount-row">{[0, 5, 10].map(p => <button key={p} onClick={() => setDiscount(Math.round(subtotal * p) / 100)}>{p}%</button>)}<input type="number" min={0} placeholder="Amount" value={discount || ''} onChange={e => setDiscount(Math.max(0, Number(e.target.value)))} /></div>}
          <div><span>Tax <small>({taxRate}%)</small></span><b>{pkr(tax)}</b></div>
          <div className="bill-total"><strong>Total due</strong><strong>{pkr(total)}</strong></div>
        </div>
        <div className="payment-choices">{([['CASH', '▣ Cash'], ['CARD', 'Card'], ['WALLET', '◈ Wallet']] as const).map(([k, l]) => <button key={k} className={payment === k ? 'payment-active' : ''} onClick={() => setPayment(k)}>{k === 'CARD' && <CreditCard size={15} />}{l}</button>)}</div>
        {payment === 'CASH' && cart.length > 0 && <div className="tender-row"><input type="number" min={0} placeholder="Cash tendered" value={tendered} onChange={e => setTendered(e.target.value)} />{change !== null && <span className={change < 0 ? 'stat-negative' : 'stat-positive'}>{change < 0 ? `Short ${pkr(-change)}` : `Change ${pkr(change)}`}</span>}</div>}
        <Button onClick={checkout} loading={busy}>Complete sale <span>{pkr(total)}</span></Button>
        <div className="shortcut-hint"><kbd>F2</kbd> Search <kbd>F4</kbd> Pay <kbd>Enter</kbd> Add scanned item</div>
      </aside>
    </div>
    <div className="mobile-checkout"><div><span>{cart.length} items</span><strong>{pkr(total)}</strong></div><Button onClick={checkout} loading={busy}>Checkout</Button></div>
    {done && <Modal title="Sale completed" subtitle={`Invoice ${done.invoiceNumber} · ${pkr(done.total)}`} icon={Check} onClose={() => { setDone(null); searchRef.current?.focus() }}
      footer={<><Button variant="outline" icon={Plus} onClick={() => { setDone(null); searchRef.current?.focus() }}>New sale</Button><Button icon={FileText} onClick={() => navigate(`/sales/${done.id}/receipt?print=1`)}>Print receipt</Button></>}>
      <p className="muted">Stock was deducted from the earliest-expiring valid batches. You can reprint this receipt anytime from Sales History.</p>
    </Modal>}
  </>
}
