import type { Prisma } from '@prisma/client'

export function poSummary(po: Prisma.PurchaseOrderGetPayload<{ include: { supplier: { select: { id: true; name: true } }; items: true } }>) {
  const ordered = po.items.reduce((s, i) => s + i.quantityOrdered, 0)
  const received = po.items.reduce((s, i) => s + Math.min(i.quantityReceived, i.quantityOrdered), 0)
  const amount = po.items.reduce((s, i) => s + i.quantityOrdered * Number(i.unitCost ?? 0), 0)
  return { id: po.id, poNumber: po.poNumber, supplier: po.supplier, status: po.status, notes: po.notes, orderedAt: po.orderedAt, receivedAt: po.receivedAt, createdAt: po.createdAt, itemCount: po.items.length, ordered, received, amount }
}
