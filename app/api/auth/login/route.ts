import bcrypt from 'bcryptjs'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/server/db'
import { errorResponse, HttpError } from '@/lib/server/api'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '@/lib/session'

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })

// Basic in-memory brute-force throttle: 8 failed attempts per email+IP per 15 minutes.
const failures = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  try {
    const { email, password } = schema.parse(await req.json().catch(() => ({})))
    const key = `${email}|${req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local'}`
    const f = failures.get(key)
    if (f && f.count >= 8 && f.until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.')

    const user = await prisma.user.findUnique({ where: { email } })
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv')
    if (!user || !ok) {
      const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + 15 * 60_000 }
      failures.set(key, { count: cur.count + 1, until: cur.until })
      throw new HttpError(401, 'Incorrect email or password')
    }
    if (!user.active) throw new HttpError(403, 'Your account has been deactivated. Contact the administrator.')
    failures.delete(key)
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })

    const token = await signSession({ sub: user.id, name: user.name, email: user.email, role: user.role })
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_TTL_SECONDS })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
