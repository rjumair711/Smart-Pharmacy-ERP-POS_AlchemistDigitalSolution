import { Prisma, type Role } from '@prisma/client'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { SESSION_COOKIE, verifySession, type SessionPayload } from '@/lib/session'
import { prisma } from './db'

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message) }
}

export type AuthedUser = SessionPayload & { id: string }

export async function currentUser(): Promise<AuthedUser | null> {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!session) return null
  return { ...session, id: session.sub }
}

/** Convert Prisma Decimals to numbers so the client receives plain JSON numbers. */
export function serialize<T>(value: T): any {
  if (value === null || value === undefined) return value
  if (Prisma.Decimal.isDecimal(value)) return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v)
    return out
  }
  return value
}

// Deactivated users lose access within ACTIVE_TTL_MS even though their JWT is still valid.
const ACTIVE_TTL_MS = 30_000
const activeCache = new Map<string, { active: boolean; at: number }>()
async function isActive(userId: string) {
  const hit = activeCache.get(userId)
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.active
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } })
  activeCache.set(userId, { active: !!u?.active, at: Date.now() })
  return !!u?.active
}
export function invalidateUserCache(userId: string) { activeCache.delete(userId) }

type Ctx = { user: AuthedUser; params: Record<string, string> }
type Handler = (req: NextRequest, ctx: Ctx) => Promise<unknown>

/**
 * Wraps a route handler with authentication, role checks and uniform error handling.
 * roles omitted => any signed-in user.
 */
export function route(roles: Role[] | null, handler: Handler) {
  return async (req: NextRequest, context: { params?: Promise<Record<string, string>> }) => {
    try {
      const user = await currentUser()
      if (!user) throw new HttpError(401, 'Please sign in to continue')
      if (roles && !roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to perform this action')
      if (!(await isActive(user.id))) throw new HttpError(401, 'Your account is inactive')
      const params = (await context?.params) ?? {}
      const result = await handler(req, { user, params })
      if (result instanceof Response) return result
      return NextResponse.json(serialize(result ?? { ok: true }))
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message, details: err.details }, { status: err.status })
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return NextResponse.json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', details: err.issues }, { status: 400 })
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return NextResponse.json({ error: `A record with this ${(err.meta?.target as string[] | undefined)?.join(', ') ?? 'value'} already exists` }, { status: 409 })
    if (err.code === 'P2025') return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    if (err.code === 'P2003') return NextResponse.json({ error: 'This record is in use by other records and cannot be removed' }, { status: 409 })
  }
  console.error('[api]', err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown
  try { json = await req.json() } catch { throw new HttpError(400, 'Request body must be valid JSON') }
  return schema.parse(json)
}
