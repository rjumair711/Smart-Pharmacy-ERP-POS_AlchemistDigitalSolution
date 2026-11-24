import { Prisma } from '@prisma/client'
import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { billConfirmSchema } from '@/lib/server/schemas'
import { receiveStock } from '@/lib/server/stock'
import { parseDateOnly } from '@/lib/server/util'

/** Scan history */
export const GET = route(['ADMIN'], async () => {
  const bills = await prisma.supplierBill.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { supplier: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { batches: true, poReceipts: true } } },
  })
  return bills.map(({ rawExtraction, ...b }) => b)
})

/** "Confirm & Add to Stock": records the bill, adds every verified line to batches and reconciles open POs. */
export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, billConfirmSchema)
  return prisma.$transaction(async tx => {
    const total = data.totalAmount ?? data.lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0)
    const bill = await tx.supplierBill.create({
      data: {
        billNumber: data.billNumber || null,
        supplierId: data.supplierId || null,
        billDate: data.billDate ? parseDateOnly(data.billDate) : null,
        totalAmount: total,
        fileName: data.fileName || null,
        aiModel: data.aiModel || null,
        rawExtraction: (data.rawExtraction ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdById: user.id,
      },
    })
    const result = await receiveStock(tx, {
      lines: data.lines.map(l => ({ ...l, expiryDate: parseDateOnly(l.expiryDate) })),
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId,
      supplierBillId: bill.id,
      reconcile: data.reconcile,
      source: 'AI_BILL',
      userId: user.id,
      reference: `Supplier bill ${data.billNumber || bill.id.slice(-6)}`,
    })
    return { billId: bill.id, ...result }
  }, { timeout: 60_000, maxWait: 10_000 })
})
