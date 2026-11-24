import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, cashierCanOpen, verifySession } from '@/lib/session'

/**
 * Optimistic page guard: unauthenticated users go to /login, cashiers are kept on
 * the pages their role allows. Every API route still enforces auth + role itself.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    if (session) return NextResponse.redirect(new URL(session.role === 'ADMIN' ? '/dashboard' : '/pos', req.url))
    return NextResponse.next()
  }
  if (!session) {
    const url = new URL('/login', req.url)
    if (pathname !== '/') url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  if (pathname === '/') return NextResponse.redirect(new URL(session.role === 'ADMIN' ? '/dashboard' : '/pos', req.url))
  if (session.role === 'CASHIER' && !cashierCanOpen(pathname)) {
    return NextResponse.redirect(new URL('/pos?denied=1', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
