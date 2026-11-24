import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { receiveSchema } from '@/lib/server/schemas'
import { receiveStock, type ReceiveResult } from '@/lib/server/stock'
import { parseDateOnly } from '@/lib/server/util'

class Rollback { constructor(public result: ReceiveResult) {} }

/**
 * Dry-run of "Confirm & Add to Stock": executes the exact receive + PO reconciliation
 * logic inside a transaction and rolls it back, so the pharmacist sees precisely which
 * purchase-order lines will be fulfilled before committing.
 */
export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, receiveSchema)
  try {
    await prisma.$transaction(async tx => {
      const result = await receiveStock(tx, {
        lines: data.lines.map(l => ({ ...l, expiryDate: parseDateOnly(l.expiryDate) })),
        supplierId: data.supplierId, purchaseOrderId: data.purchaseOrderId, reconcile: data.reconcile, source: 'AI_BILL', userId: user.id,
      })
      throw new Rollback(result)
    }, { timeout: 60_000, maxWait: 10_000 })
  } catch (e) {
    if (e instanceof Rollback) return { preview: true, ...e.result }
    throw e
  }
})
