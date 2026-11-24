'use client'
import { useMemo, useState } from 'react'
import { Blocks, ChevronRight, FlaskConical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api, num, useApi } from '@/lib/client'
import { Button, Empty, ErrorBanner, Field, Loading, Modal, PageTitle, useApp, useConfirm } from '../kit'

const COLORS = ['mint', 'blue', 'amber', 'violet', 'rose', 'slate', 'green']

export default function Categories() {
  const { toast, navigate } = useApp()
  const confirm = useConfirm()
  const { data, error, reload } = useApi<any[]>('/api/categories')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'medicines' | 'units'>('name')
  const [editing, setEditing] = useState<any | null>(null)
  const rows = useMemo(() => (data ?? []).filter(c => `${c.name} ${c.description ?? ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'medicines' ? b.medicineCount - a.medicineCount : b.units - a.units), [data, q, sort])
  const remove = async (c: any) => {
    if (!confirm(`del-${c.id}`, `Click delete again to remove “${c.name}”`)) return
    try { await api(`/api/categories/${c.id}`, { method: 'DELETE' }); toast('Category deleted'); reload() } catch (e: any) { toast(e.message, 'error') }
  }
  return <>
    <PageTitle title="Medicine categories" subtitle="Organize your pharmacy inventory by category."><Button icon={Plus} onClick={() => setEditing({})}>Add category</Button></PageTitle>
    <div className="category-controls"><label className="table-search"><Search size={16} /><input placeholder="Search categories..." value={q} onChange={e => setQ(e.target.value)} /></label>
      <select className="tool-select" value={sort} onChange={e => setSort(e.target.value as any)}><option value="name">Sort by: Name</option><option value="medicines">Sort by: Medicines</option><option value="units">Sort by: Stock units</option></select></div>
    {error ? <ErrorBanner message={error} onRetry={reload} /> : !data ? <Loading /> : rows.length === 0 ? <Empty icon={Blocks} title="No categories" sub="Create your first category" /> :
      <div className="category-card-grid">{rows.map(c => <div className="category-card" key={c.id}>
        <div className={`category-card-icon ${c.color}`}><FlaskConical size={20} /></div>
        <div className="category-actions"><button className="category-menu" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil size={15} /></button><button className="category-menu" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}><Trash2 size={15} /></button></div>
        <h3>{c.name}</h3><p>{c.description || 'No description'}</p>
        <div className="category-card-meta"><span>{c.medicineCount} medicines</span><span>{num(c.units)} units</span></div>
        <button className="category-view" onClick={() => navigate(`/inventory?categoryId=${c.id}`)}>View medicines <ChevronRight size={14} /></button>
      </div>)}</div>}
    {editing && <CategoryModal cat={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast(editing.id ? 'Category updated' : 'Category created') }} />}
  </>
}

function CategoryModal({ cat, onClose, onSaved }: { cat: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const [f, setF] = useState({ name: cat.name ?? '', description: cat.description ?? '', color: cat.color ?? 'mint' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Category name is required', 'error')
    setBusy(true)
    try { await api(cat.id ? `/api/categories/${cat.id}` : '/api/categories', { method: cat.id ? 'PATCH' : 'POST', body: f }); onSaved() } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Modal title={cat.id ? 'Edit category' : 'Add category'} icon={Blocks} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save category</Button></>}>
    <Field label="Category name *"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Inhalers" /></Field>
    <Field label="Description"><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Short description" /></Field>
    <div className="field-label">Colour<div className="color-pick">{COLORS.map(c => <button key={c} type="button" aria-label={c} className={`category-card-icon ${c} ${f.color === c ? 'color-on' : ''}`} onClick={() => setF({ ...f, color: c })}><FlaskConical size={14} /></button>)}</div></div>
  </Modal>
}
