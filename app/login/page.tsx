'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BriefcaseMedical, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sign in failed')
      const next = params.get('next')
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : json.user.role === 'ADMIN' ? '/dashboard' : '/pos'
    } catch (err: any) { setError(err.message); setBusy(false) }
  }
  const demo = (role: 'admin' | 'cashier') => { setEmail(`${role}@noorcare.pk`); setPassword(role === 'admin' ? 'Admin@123' : 'Cashier@123') }
  return <div className="login-shell">
    <div className="login-art"><div className="brand"><div className="brand-mark"><BriefcaseMedical size={20} strokeWidth={2.4} /></div><span>MediFlow<span className="brand-ai">AI</span><small>PHARMACY OS</small></span></div>
      <h2>Inventory, procurement and POS — in one calm workspace.</h2>
      <ul><li><ShieldCheck size={15} /> FEFO billing that blocks expired batches</li><li><ShieldCheck size={15} /> AI supplier-bill scanning with PO auto-reconciliation</li><li><ShieldCheck size={15} /> Expiry & low-stock alerts with one-click reorder</li></ul></div>
    <form className="login-card" onSubmit={submit}>
      <h1>Sign in</h1><p>Use your pharmacy account to continue.</p>
      {error && <div className="error-banner"><span>{error}</span></div>}
      <label className="field-label">Email<div className="input-icon"><Mail size={15} /><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@pharmacy.pk" /></div></label>
      <label className="field-label">Password<div className="input-icon"><LockKeyhole size={15} /><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></div></label>
      <button className="button button-primary login-submit" disabled={busy}>{busy && <Loader2 size={16} className="spin" />}Sign in</button>
      <div className="demo-logins"><span>Demo accounts</span><button type="button" onClick={() => demo('admin')}>Admin / Pharmacist</button><button type="button" onClick={() => demo('cashier')}>Cashier</button></div>
    </form>
  </div>
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
