import { route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { computeAlerts } from '@/lib/server/alerts'

/** Live alerts: Expired (blocked from sale), Expiring soon, Low stock, Out of stock */
export const GET = route(['ADMIN'], async () => computeAlerts(prisma))
