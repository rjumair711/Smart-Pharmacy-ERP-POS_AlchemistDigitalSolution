// Edge-safe session helpers (used by proxy.ts and server code)
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'mediflow_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours (one shift + margin)

export type SessionRole = 'ADMIN' | 'CASHIER'
export type SessionPayload = { sub: string; name: string; email: string; role: SessionRole }

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)')
  return new TextEncoder().encode(s)
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ name: payload.name, email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (!payload.sub || (payload.role !== 'ADMIN' && payload.role !== 'CASHIER')) return null
    return { sub: payload.sub, name: String(payload.name), email: String(payload.email), role: payload.role }
  } catch {
    return null
  }
}

/** Page routes a cashier may open. Everything else is admin-only. */
export const CASHIER_PAGES = ['/pos', '/inventory', '/sales', '/customer-returns']
export const CASHIER_BLOCKED_PAGES = ['/inventory/add-stock']

export function cashierCanOpen(path: string) {
  if (CASHIER_BLOCKED_PAGES.some(p => path === p || path.startsWith(p + '/'))) return false
  return CASHIER_PAGES.some(p => path === p || path.startsWith(p + '/'))
}
