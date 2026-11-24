'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BriefcaseMedical, Clock3, FileText, KeyRound, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { api, relTime, useApi } from '@/lib/client'
import { Button, ErrorBanner, Field, Loading, Modal, PageTitle, Status, useApp } from '../kit'

function useSettingsForm() {
  const { data, error, reload } = useApi<any>('/api/settings')
  const [f, setF] = useState<any>(null)
  useEffect(() => { if (data) setF({ ...data, taxRate: Number(data.taxRate) }) }, [data])
  return { data, error, reload, f, setF }
}

export function AlertSettings() {
  const { toast, refreshBadges } = useApp()
  const { f, setF, error, reload, data } = useSettingsForm()
  const { data: meds, reload: reloadMeds } = useApi<any>('/api/medicines?pageSize=500')
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<any | null>(null)
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!f) return <Loading />
  const save = async () => {
    setBusy(true)
    try { await api('/api/settings', { method: 'PATCH', body: { expiryAlertsEnabled: f.expiryAlertsEnabled, expiryLeadDays: Number(f.expiryLeadDays), lowStockAlertsEnabled: f.lowStockAlertsEnabled, lowStockThreshold: Number(f.lowStockThreshold) } }); toast('Alert settings saved'); reload(); reloadMeds(); refreshBadges() } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const overrides = (meds?.items ?? []).filter((m: any) => m.lowStockThreshold !== null || m.expiryLeadDays !== null)
  const clearOverride = async (m: any) => { try { await api(`/api/medicines/${m.id}`, { method: 'PATCH', body: { lowStockThreshold: null, expiryLeadDays: null } }); toast(`Override removed for ${m.name}`); reloadMeds(); refreshBadges() } catch (e: any) { toast(e.message, 'error') } }
  return <>
    <PageTitle title="Alert settings" subtitle="Configure expiry and low-stock notifications for your pharmacy."><Button variant="outline" onClick={() => setF({ ...f, expiryLeadDays: 30, lowStockThreshold: 20, expiryAlertsEnabled: true, lowStockAlertsEnabled: true })}>Reset to default</Button><Button loading={busy} onClick={save}>Save changes</Button></PageTitle>
    <div className="settings-grid">
      <section className="panel settings-card"><div className="settings-card-icon amber"><Clock3 size={18} /></div><h2>Expiry alerts</h2><p>Get notified before medicines approach their expiry date. Expired batches are always blocked from sale.</p>
        <div className="setting-row"><div><strong>Expiry notifications</strong><small>Show alerts for batches nearing expiry</small></div><input type="checkbox" checked={f.expiryAlertsEnabled} onChange={e => setF({ ...f, expiryAlertsEnabled: e.target.checked })} /></div>
        <label className="field-label">Global expiry lead time <div className="inline-select"><input type="number" min={1} max={730} value={f.expiryLeadDays} onChange={e => setF({ ...f, expiryLeadDays: e.target.value })} /><span>days before expiry</span></div></label>
        <div className="quick-days">{[30, 60, 90].map(x => <button key={x} className={Number(f.expiryLeadDays) === x ? 'quick-on' : ''} onClick={() => setF({ ...f, expiryLeadDays: x })}>{x} days</button>)}</div></section>
      <section className="panel settings-card"><div className="settings-card-icon blue"><AlertTriangle size={18} /></div><h2>Low-stock alerts</h2><p>Set the default threshold for medicine replenishment warnings.</p>
        <div className="setting-row"><div><strong>Low-stock notifications</strong><small>Alert when sellable stock falls to or below threshold</small></div><input type="checkbox" checked={f.lowStockAlertsEnabled} onChange={e => setF({ ...f, lowStockAlertsEnabled: e.target.checked })} /></div>
        <label className="field-label">Default minimum quantity<input type="number" min={0} value={f.lowStockThreshold} onChange={e => setF({ ...f, lowStockThreshold: e.target.value })} /></label></section>
      <section className="panel settings-card override-card"><div><h2>Medicine-specific overrides</h2><p>Override global thresholds for individual medicines (e.g. insulin needs a longer expiry lead time).</p></div><Button variant="outline" icon={Plus} onClick={() => setOverride({})}>Add override</Button>
        <div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>CATEGORY</th><th>LOW-STOCK (GLOBAL {data.lowStockThreshold})</th><th>EXPIRY LEAD (GLOBAL {data.expiryLeadDays}D)</th><th>CURRENT STOCK</th><th /></tr></thead><tbody>{overrides.length === 0 ? <tr><td colSpan={6}>No overrides — all medicines use the global defaults.</td></tr> : overrides.map((m: any) => <tr key={m.id}><td>{m.name}</td><td>{m.category}</td><td>{m.lowStockThreshold ?? <span className="muted">global</span>}</td><td>{m.expiryLeadDays !== null ? `${m.expiryLeadDays} days` : <span className="muted">global</span>}</td><td>{m.stock} <Status>{m.status}</Status></td><td className="action-cell"><button className="row-more" aria-label="Edit" onClick={() => setOverride(m)}><Pencil size={15} /></button><button className="row-more" aria-label="Remove override" onClick={() => clearOverride(m)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></section>
    </div>
    {override && <OverrideModal med={override} meds={meds?.items ?? []} onClose={() => setOverride(null)} onSaved={() => { setOverride(null); reloadMeds(); refreshBadges(); toast('Override saved') }} />}
  </>
}

function OverrideModal({ med, meds, onClose, onSaved }: { med: any; meds: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const [id, setId] = useState(med.id ?? '')
  const [low, setLow] = useState<string>(med.lowStockThreshold?.toString() ?? '')
  const [lead, setLead] = useState<string>(med.expiryLeadDays?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!id) return toast('Select a medicine', 'error')
    setBusy(true)
    try { await api(`/api/medicines/${id}`, { method: 'PATCH', body: { lowStockThreshold: low === '' ? null : Number(low), expiryLeadDays: lead === '' ? null : Number(lead) } }); onSaved() } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title={med.id ? `Override · ${med.name}` : 'Add override'} icon={AlertTriangle} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save override</Button></>}>
    {!med.id && <Field label="Medicine *"><select value={id} onChange={e => setId(e.target.value)}><option value="">Select medicine</option>{meds.map(m => <option key={m.id} value={m.id}>{m.name} · {m.category}</option>)}</select></Field>}
    <Field label="Low-stock threshold (units)" hint="Blank = use global default"><input type="number" min={0} value={low} onChange={e => setLow(e.target.value)} /></Field>
    <Field label="Expiry alert lead time (days)" hint="Blank = use global default"><input type="number" min={0} value={lead} onChange={e => setLead(e.target.value)} /></Field>
  </Modal>
}

export function UsersSettings() {
  const { toast, session } = useApp()
  const { data, error, reload } = useApi<any[]>('/api/users')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const rows = useMemo(() => (data ?? []).filter(u => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  const toggle = async (u: any) => { try { await api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); toast(`${u.name} ${u.active ? 'deactivated' : 'activated'}`); reload() } catch (e: any) { toast(e.message, 'error') } }
  return <>
    <PageTitle title="Users & roles" subtitle="Manage team access and role permissions."><Button icon={Plus} onClick={() => setEditing({})}>Add user</Button></PageTitle>
    <section className="panel list-panel"><div className="table-tools"><label className="table-search"><Search size={16} /><input placeholder="Search team members..." value={q} onChange={e => setQ(e.target.value)} /></label></div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : <div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>LAST ACTIVE</th><th /></tr></thead><tbody>{rows.map(u => <tr key={u.id}><td><strong className="normal-weight">{u.name}</strong>{u.id === session.user.id && <small className="muted-sub">You</small>}</td><td>{u.email}</td><td>{u.role === 'ADMIN' ? 'Admin / Pharmacist' : 'Cashier'}</td><td><Status>{u.active ? 'Active' : 'Inactive'}</Status></td><td>{relTime(u.lastActiveAt)}</td>
        <td className="action-cell"><button className="row-more" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}><Pencil size={15} /></button>{u.id !== session.user.id && <button className="text-action" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="permission-cards"><div className="panel"><h3>Admin / Pharmacist</h3><p>Full access to all pharmacy operations and settings.</p><span>Dashboard · Categories · Inventory (manual & AI) · Purchase orders · Supplier & customer returns · Alerts & settings · Financial reports</span></div><div className="panel"><h3>Cashier</h3><p>Sales counter access with essential lookup tools. Cannot delete stock, manage purchase orders or change settings.</p><span>POS billing · Receipts · Stock lookup · Sales history · Customer returns</span></div></div>
    {editing && <UserModal user={editing} self={editing.id === session.user.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast(editing.id ? 'User updated' : 'User created') }} />}
  </>
}

function UserModal({ user, self, onClose, onSaved }: { user: any; self: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const [f, setF] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'CASHIER', password: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!user.id && f.password.length < 8) return toast('Password must be at least 8 characters', 'error')
    if (user.id && f.password && f.password.length < 8) return toast('New password must be at least 8 characters', 'error')
    setBusy(true)
    try {
      if (user.id) await api(`/api/users/${user.id}`, { method: 'PATCH', body: { name: f.name, ...(self ? {} : { role: f.role }), ...(f.password ? { password: f.password } : {}) } })
      else await api('/api/users', { body: f })
      onSaved()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title={user.id ? 'Edit user' : 'Add user'} icon={Users} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save user</Button></>}>
    <Field label="Full name *"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Email *"><input type="email" value={f.email} disabled={!!user.id} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
    <Field label="Role *"><select value={f.role} disabled={self} onChange={e => setF({ ...f, role: e.target.value })}><option value="CASHIER">Cashier / Sales counter</option><option value="ADMIN">Admin / Pharmacist</option></select></Field>
    <Field label={user.id ? 'New password (optional)' : 'Password *'} hint="Minimum 8 characters"><input type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
  </Modal>
}

export function GeneralSettings() {
  const { toast } = useApp()
  const { f, setF, error, reload } = useSettingsForm()
  const [busy, setBusy] = useState(false)
  if (error) return <ErrorBanner message={error} onRetry={reload} />
  if (!f) return <Loading />
  const save = async () => {
    setBusy(true)
    try { await api('/api/settings', { method: 'PATCH', body: { pharmacyName: f.pharmacyName, phone: f.phone, email: f.email, address: f.address, currency: f.currency, taxRate: Number(f.taxRate), invoicePrefix: f.invoicePrefix, receiptFormat: f.receiptFormat, receiptFooter: f.receiptFooter } }); toast('Settings saved — reload to update the sidebar'); reload() } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return <>
    <PageTitle title="General settings" subtitle="Update pharmacy information and receipt preferences."><Button variant="outline" onClick={reload}>Discard changes</Button><Button loading={busy} onClick={save}>Save changes</Button></PageTitle>
    <div className="settings-grid"><section className="panel settings-card"><div className="settings-card-icon mint"><BriefcaseMedical size={18} /></div><h2>Pharmacy profile</h2><p>These details appear on receipts and reports.</p><div className="form-grid">
      <Field label="Pharmacy name"><input value={f.pharmacyName} onChange={set('pharmacyName')} /></Field><Field label="Phone number"><input value={f.phone ?? ''} onChange={set('phone')} /></Field>
      <Field label="Email address"><input value={f.email ?? ''} onChange={set('email')} /></Field><Field label="Currency"><select value={f.currency} onChange={set('currency')}><option value="PKR">PKR — Pakistani Rupee</option></select></Field>
      <Field label="Address"><input value={f.address ?? ''} onChange={set('address')} /></Field><Field label="Tax rate (%)"><input type="number" min={0} max={100} step="0.01" value={f.taxRate} onChange={set('taxRate')} /></Field></div></section>
      <section className="panel settings-card"><div className="settings-card-icon blue"><FileText size={18} /></div><h2>Receipt preferences</h2><p>Choose how customer receipts are formatted.</p>
        <Field label="Invoice number prefix" hint="Applies to new invoices"><input value={f.invoicePrefix} onChange={set('invoicePrefix')} /></Field>
        <Field label="Default receipt format"><select value={f.receiptFormat} onChange={set('receiptFormat')}><option value="thermal">Thermal (80mm)</option><option value="a4">A4 invoice</option></select></Field>
        <Field label="Receipt footer message"><input value={f.receiptFooter ?? ''} onChange={set('receiptFooter')} /></Field>
        <div className="receipt-preview"><strong>{f.pharmacyName.toUpperCase()}</strong><small>{f.address}</small><span>{f.invoicePrefix}00001 · {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span><b>{f.receiptFooter}</b></div></section>
      <section className="panel settings-card"><div className="settings-card-icon violet"><KeyRound size={18} /></div><h2>Security</h2><p>Sessions use signed, HTTP-only cookies and expire after 12 hours. Change your password from Users &amp; Roles.</p></section>
    </div>
  </>
}
