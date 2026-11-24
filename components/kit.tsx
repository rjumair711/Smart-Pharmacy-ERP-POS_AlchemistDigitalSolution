'use client'
import { createContext, useContext, useEffect, useRef } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'

export type Session = { user: { id: string; name: string; email: string; role: 'ADMIN' | 'CASHIER' }; pharmacy: { name: string; address: string | null; phone: string | null; currency: string } }
type AppCtx = { session: Session; isAdmin: boolean; toast: (msg: string, tone?: 'ok' | 'error') => void; navigate: (href: string) => void; refreshBadges: () => void }
export const AppContext = createContext<AppCtx | null>(null)
export const useApp = () => {
  const c = useContext(AppContext)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function Status({ children }: { children: string }) {
  const t = children.toLowerCase()
  const tone = t.includes('expired') || t.includes('out') || t.includes('cancel') || t.includes('inactive') || t.includes('refunded') || t.includes('blocked') || t.includes('unordered')
    ? 'red'
    : t.includes('low') || t.includes('partial') || t.includes('expir') || t.includes('near') || t.includes('review') || t.includes('draft') || t.includes('new medicine')
      ? 'amber'
      : t.includes('received') || t.includes('stock') || t.includes('active') || t.includes('completed') || t.includes('matched') || t.includes('fefo') || t.includes('valid') || t.includes('restocked')
        ? 'green'
        : 'blue'
  return <span className={`status status-${tone}`}><i />{children}</span>
}

export function PageTitle({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow || 'MEDIFLOW AI  /  PHARMACY OPERATIONS'}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="title-actions">{children}</div></div>
}

export function Button({ children, variant = 'primary', onClick, icon: Icon, disabled, loading, type = 'button', className = '' }: { children?: React.ReactNode; variant?: 'primary' | 'outline' | 'quiet' | 'danger'; onClick?: () => void; icon?: React.ElementType; disabled?: boolean; loading?: boolean; type?: 'button' | 'submit'; className?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled || loading} className={`button button-${variant} ${className}`}>{loading ? <Loader2 size={16} className="spin" /> : Icon && <Icon size={16} />}{children}</button>
}

export function SmallMetric({ label, value, sub, icon: Icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; tone?: string }) {
  return <div className="small-metric"><span className={`small-metric-icon ${tone || ''}`}><Icon size={16} /></span><div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div></div>
}

export function Loading({ label = 'Loading…', inline }: { label?: string; inline?: boolean }) {
  return <div className={inline ? 'loading-inline' : 'loading-block'}><Loader2 size={18} className="spin" /><span>{label}</span></div>
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner"><AlertTriangle size={16} /><span>{message}</span>{onRetry && <button onClick={onRetry}>Retry</button>}</div>
}

export function Empty({ icon: Icon, title, sub, children }: { icon: React.ElementType; title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="empty-state"><div><Icon size={22} /></div><strong>{title}</strong>{sub && <span>{sub}</span>}{children}</div>
}

export function Modal({ title, subtitle, icon: Icon, onClose, children, footer, wide }: { title: string; subtitle?: string; icon?: React.ElementType; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
    {Icon && <div className="modal-symbol"><Icon size={21} /></div>}
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
    <div className="modal-body">{children}</div>
    {footer && <div className="modal-actions">{footer}</div>}
  </div></div>
}

export function Pagination({ page, pageSize, total, onPage, noun = 'records' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - page) <= 1)
  return <div className="pagination"><span>Showing {start}–{Math.min(total, page * pageSize)} of {total.toLocaleString()} {noun}</span><div>
    <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
    {nums.map((n, i) => <span key={n} className="page-wrap">{i > 0 && n - nums[i - 1] > 1 && <span>…</span>}<button className={n === page ? 'page-current' : ''} onClick={() => onPage(n)}>{n}</button></span>)}
    <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
  </div></div>
}

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return <label className={`field-label ${className}`}>{label}{children}{hint && <small className="field-hint">{hint}</small>}</label>
}

/** Two-click confirmation (avoids blocking browser dialogs): returns true on the second call within 4s. */
export function useConfirm() {
  const { toast } = useApp()
  const ref = useRef<{ key: string; at: number } | null>(null)
  return (key: string, message = 'Click again to confirm') => {
    const r = ref.current
    if (r && r.key === key && Date.now() - r.at < 4000) { ref.current = null; return true }
    ref.current = { key, at: Date.now() }
    toast(message)
    return false
  }
}
