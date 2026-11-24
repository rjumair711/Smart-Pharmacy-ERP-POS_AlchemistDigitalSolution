import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { receiveSchema } from '@/lib/server/schemas'
import { receiveStock } from '@/lib/server/stock'
import { parseDateOnly } from '@/lib/server/util'

/** Manual stock entry (admin). Also auto-reconciles against open purchase orders. */
export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, receiveSchema)
  return prisma.$transaction(
    tx => receiveStock(tx, {
      lines: data.lines.map(l => ({ ...l, expiryDate: parseDateOnly(l.expiryDate) })),
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId,
      reconcile: data.reconcile,
      source: 'MANUAL',
      userId: user.id,
      reference: 'Manual stock entry',
    }),
    { timeout: 30_000, maxWait: 10_000 },
  )
})
