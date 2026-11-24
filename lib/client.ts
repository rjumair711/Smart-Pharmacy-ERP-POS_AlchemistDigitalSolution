'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** fetch wrapper: JSON in/out, throws ApiError with the server's message, redirects to /login on 401. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
  }
  if (!res.ok) throw new ApiError(res.status, json?.error || `Request failed (${res.status})`)
  return json as T
}

/** Minimal SWR-style hook. Pass null to skip. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const ctrl = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    if (!path) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setLoading(true)
    try {
      const d = await api<T>(path, { signal: c.signal })
      if (!c.signal.aborted) { setData(d); setError(null) }
    } catch (e: any) {
      if (e?.name !== 'AbortError' && !c.signal.aborted) setError(e?.message ?? 'Failed to load')
    } finally {
      if (!c.signal.aborted) setLoading(false)
    }
  }, [path])
  useEffect(() => { load(); return () => ctrl.current?.abort() }, [load])
  return { data, error, loading, reload: load, setData }
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// ── formatting ────────────────────────────────────────────────────────────
export const pkr = (n: number | null | undefined, currency = 'PKR') => `${currency} ${Number(n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`
export const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })
export const compact = (n: number) => {
  const a = Math.abs(n)
  return a >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString('en-PK')
}
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`)
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)}`
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const relTime = (iso: string | null | undefined) => {
  if (!iso) return 'Never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return 'Just now'
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`
  if (s < 172800) return 'Yesterday'
  return fmtDate(iso)
}

export const PO_LABEL: Record<string, string> = { DRAFT: 'Draft', ORDERED: 'Ordered', PARTIALLY_RECEIVED: 'Partially received', RECEIVED: 'Received', CANCELLED: 'Cancelled' }
export const PAY_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', WALLET: 'Digital wallet' }
export const REASON_LABEL: Record<string, string> = { EXPIRED: 'Expired', NEAR_EXPIRY: 'Near expiry', DAMAGED: 'Damaged', EXCESS: 'Excess stock', OTHER: 'Other' }

/** Download rows as CSV */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
