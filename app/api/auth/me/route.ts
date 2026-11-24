import { route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { getSettings } from '@/lib/server/util'

export const GET = route(null, async (_req, { user }) => {
  const [u, settings] = await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() }, select: { id: true, name: true, email: true, role: true } }),
    getSettings(prisma),
  ])
  return { user: u, pharmacy: { name: settings.pharmacyName, address: settings.address, phone: settings.phone, currency: settings.currency } }
})
