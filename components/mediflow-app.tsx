'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Blocks, BriefcaseMedical, Check, ChevronDown, ChevronRight, ClipboardList, CreditCard, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package, Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Truck, Users, X } from 'lucide-react'
import { api } from '@/lib/client'
import { AppContext, Loading, type Session } from './kit'
import Dashboard from './pages/dashboard'
import POS from './pages/pos'
import { Inventory, MedicineDetail, StockEntry } from './pages/inventory'
import Categories from './pages/categories'
import Scanner from './pages/scanner'
import { PurchaseOrders, NewPurchaseOrder, PurchaseOrderDetail } from './pages/purchase-orders'
import { Suppliers, SupplierDetail } from './pages/suppliers'
import { CustomerReturns, SupplierReturns, CreditNote, DebitNote } from './pages/returns'
import Alerts from './pages/alerts'
import { Sales, SaleDetail } from './pages/sales'
import Reports from './pages/reports'
import { AlertSettings, UsersSettings, GeneralSettings } from './pages/settings'

type NavItem = { label: string; href: string; icon: React.ElementType; badge?: 'alerts' | 'inventory' | 'AI'; admin?: boolean }
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'MAIN', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, admin: true }, { label: 'Point of Sale', href: '/pos', icon: ShoppingCart }, { label: 'Inventory', href: '/inventory', icon: Package, badge: 'inventory' }, { label: 'Categories', href: '/categories', icon: Blocks, admin: true }, { label: 'AI Bill Scanner', href: '/ai-bill-scanner', icon: Sparkles, badge: 'AI', admin: true }] },
  { label: 'PROCUREMENT', items: [{ label: 'Purchase Orders', href: '/purchase-orders', icon: ClipboardList, admin: true }, { label: 'Suppliers', href: '/suppliers', icon: Truck, admin: true }] },
  { label: 'OPERATIONS', items: [{ label: 'Customer Returns', href: '/customer-returns', icon: ArrowDownRight }, { label: 'Supplier Returns', href: '/supplier-returns', icon: ArrowUpRight, admin: true }, { label: 'Alerts Center', href: '/alerts', icon: AlertTriangle, badge: 'alerts', admin: true }] },
  { label: 'ANALYTICS', items: [{ label: 'Sales History', href: '/sales', icon: CreditCard }, { label: 'Reports', href: '/reports', icon: Activity, admin: true }] },
  { label: 'SYSTEM', items: [{ label: 'Alert Settings', href: '/settings/alerts', icon: Settings, admin: true }, { label: 'Users & Roles', href: '/settings/users', icon: Users, admin: true }, { label: 'General Settings', href: '/settings/general', icon: Settings, admin: true }] },
]

const titleMap: Record<string, string> = { '/dashboard': 'Dashboard', '/pos': 'Point of Sale', '/inventory': 'Inventory Management', '/inventory/add-stock': 'Add Stock', '/categories': 'Medicine Categories', '/ai-bill-scanner': 'AI Supplier Bill Scanner', '/purchase-orders': 'Purchase Orders', '/purchase-orders/new': 'Create Purchase Order', '/suppliers': 'Suppliers', '/customer-returns': 'Customer Returns', '/supplier-returns': 'Supplier Returns', '/alerts': 'Alerts Center', '/sales': 'Sales History', '/reports': 'Reports', '/settings/alerts': 'Alert Settings', '/settings/users': 'Users & Roles', '/settings/general': 'General Settings' }
const initials = (n: string) => n.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()

export default function MediFlowApp() {
  const path = usePathname() || '/dashboard'
  const router = useRouter()
  const search = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [menu, setMenu] = useState(false)
  const [toastState, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null)
  const [badges, setBadges] = useState<{ alerts: number; inventory: number }>({ alerts: 0, inventory: 0 })
  const [q, setQ] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  const toast = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ msg, tone })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 5000 : 3000)
  }, [])
  const navigate = useCallback((href: string) => { setMobileNav(false); router.push(href) }, [router])

  useEffect(() => { api<Session>('/api/auth/me').then(setSession).catch(() => {}) }, [])

  const refreshBadges = useCallback(() => {
    if (session?.user.role !== 'ADMIN') return
    api('/api/alerts').then(a => setBadges({ alerts: a.total, inventory: a.counts.LOW_STOCK + a.counts.OUT_OF_STOCK })).catch(() => {})
  }, [session])
  useEffect(() => { refreshBadges() }, [refreshBadges])
  useEffect(() => { if (search.get('denied')) toast('That area is restricted to Admin / Pharmacist accounts', 'error') }, [search, toast])

  // Global keyboard shortcut: Ctrl/⌘+K focuses search
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); (document.querySelector('[data-search]') as HTMLInputElement | null)?.focus() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/login' }

  if (!session) return <div className="boot-screen"><div className="brand-mark"><BriefcaseMedical size={20} strokeWidth={2.4} /></div><Loading label="Opening your workspace…" /></div>

  const isAdmin = session.user.role === 'ADMIN'
  const title = titleMap[path] || (path.includes('/receipt') ? 'Receipt' : path.startsWith('/inventory/') ? 'Medicine Details' : path.startsWith('/purchase-orders/') ? 'Purchase Order Details' : path.startsWith('/suppliers/') ? 'Supplier Profile' : path.startsWith('/customer-returns/') ? 'Credit Note' : path.startsWith('/supplier-returns/') ? 'Debit Note' : path.startsWith('/sales/') ? 'Sale Details' : 'MediFlow')
  const seg = path.split('/').filter(Boolean)
  const activeLink = path === '/' ? '/dashboard' : path

  const page = (() => {
    if (path === '/dashboard' || path === '/') return isAdmin ? <Dashboard /> : <POS />
    if (path === '/pos') return <POS />
    if (path === '/inventory') return <Inventory />
    if (path === '/inventory/add-stock') return <StockEntry />
    if (seg[0] === 'inventory' && seg[1]) return <MedicineDetail id={seg[1]} />
    if (path === '/categories') return <Categories />
    if (path === '/ai-bill-scanner') return <Scanner />
    if (path === '/purchase-orders') return <PurchaseOrders />
    if (path === '/purchase-orders/new') return <NewPurchaseOrder />
    if (seg[0] === 'purchase-orders' && seg[1]) return <PurchaseOrderDetail id={seg[1]} />
    if (path === '/suppliers') return <Suppliers />
    if (seg[0] === 'suppliers' && seg[1]) return <SupplierDetail id={seg[1]} />
    if (path === '/customer-returns') return <CustomerReturns />
    if (seg[0] === 'customer-returns' && seg[1]) return <CreditNote id={seg[1]} />
    if (path === '/supplier-returns') return <SupplierReturns />
    if (seg[0] === 'supplier-returns' && seg[1]) return <DebitNote id={seg[1]} />
    if (path === '/alerts') return <Alerts />
    if (path === '/sales') return <Sales />
    if (seg[0] === 'sales' && seg[1]) return <SaleDetail id={seg[1]} receipt={seg[2] === 'receipt'} />
    if (path === '/reports') return <Reports />
    if (path === '/settings/alerts') return <AlertSettings />
    if (path === '/settings/users') return <UsersSettings />
    if (path === '/settings/general') return <GeneralSettings />
    return <div className="panel"><h2>Page not found</h2><p className="muted">This page does not exist. <Link className="text-link" href={isAdmin ? '/dashboard' : '/pos'}>Go back home</Link></p></div>
  })()

  const badgeFor = (b?: NavItem['badge']) => b === 'AI' ? 'AI' : b === 'alerts' ? (badges.alerts || null) : b === 'inventory' ? (badges.inventory || null) : null

  return <AppContext.Provider value={{ session, isAdmin, toast, navigate, refreshBadges }}>
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <Link href={isAdmin ? '/dashboard' : '/pos'} className="brand"><div className="brand-mark"><BriefcaseMedical size={20} strokeWidth={2.4} /></div><span>MediFlow<span className="brand-ai">AI</span><small>PHARMACY OS</small></span><button aria-label="Close menu" className="mobile-close" onClick={e => { e.preventDefault(); setMobileNav(false) }}><X size={18} /></button></Link>
        <div className="workspace-switch"><div className="workspace-icon"><span>{initials(session.pharmacy.name)}</span></div><div className="workspace-text"><strong>{session.pharmacy.name}</strong><small>{session.pharmacy.address || 'Pharmacy workspace'}</small></div><ChevronDown size={14} /></div>
        <nav className="side-nav">{navGroups.map(group => {
          const items = group.items.filter(i => isAdmin || !i.admin)
          if (!items.length) return null
          return <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{items.map(item => {
            const badge = badgeFor(item.badge)
            return <Link onClick={() => setMobileNav(false)} href={item.href} key={item.href} className={`nav-item ${activeLink === item.href || (item.href !== '/dashboard' && activeLink.startsWith(item.href + '/')) ? 'nav-active' : ''}`}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{badge && <b className={item.badge === 'AI' ? 'ai-badge' : ''}>{badge}</b>}</Link>
          })}</div>
        })}</nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><ShieldCheck size={16} /></div><div><strong>{isAdmin ? 'Admin access' : 'Sales counter'}</strong><span>{isAdmin ? 'Full pharmacy control' : 'POS, lookup & returns'}</span></div><ChevronRight size={15} /></div>
          <div className="profile-wrap">
            <button className="profile" onClick={() => setMenu(m => !m)}><div className="avatar">{initials(session.user.name)}</div><div className="profile-info"><strong>{session.user.name}</strong><small>{isAdmin ? 'Admin · Pharmacist' : 'Cashier · Sales counter'}</small></div><MoreHorizontal size={18} /></button>
            {menu && <div className="profile-menu"><div><strong>{session.user.name}</strong><small>{session.user.email}</small></div><button onClick={logout}><LogOut size={15} /> Sign out</button></div>}
          </div>
        </div>
      </aside>
      {mobileNav && <button aria-label="Close navigation" className="nav-scrim" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button aria-label="Open navigation" className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><span>Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
          <div className="topbar-right">
            <form className="global-search" onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/inventory?q=${encodeURIComponent(q.trim())}`) }}><Search size={16} /><input data-search placeholder="Search medicines, batches..." value={q} onChange={e => setQ(e.target.value)} /><kbd>⌘ K</kbd></form>
            <button className="icon-button notification" aria-label="Alerts" onClick={() => isAdmin ? navigate('/alerts') : toast('You’re all caught up')}><Bell size={18} />{badges.alerts > 0 && <i />}</button>
            <span className="top-divider" />
            <button className="header-user" onClick={logout} title="Sign out"><div className="avatar avatar-small">{initials(session.user.name)}</div><LogOut size={14} /></button>
          </div>
        </header>
        <div className="content" onClick={() => menu && setMenu(false)}>{page}</div>
        <footer className="app-footer"><span>© {new Date().getFullYear()} MediFlow AI</span><span><i /> Connected to database</span><span>Made for better care <span className="footer-heart">♥</span></span></footer>
      </main>
      {toastState && <div className={`toast ${toastState.tone === 'error' ? 'toast-error' : ''}`}>{toastState.tone === 'error' ? <X size={17} /> : <Check size={17} />}{toastState.msg}</div>}
    </div>
  </AppContext.Provider>
}
