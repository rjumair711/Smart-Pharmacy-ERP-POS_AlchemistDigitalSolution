import type { PoStatus, Prisma } from '@prisma/client'
import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { poCreateSchema } from '@/lib/server/schemas'
import { nextNumber } from '@/lib/server/util'
import { poSummary } from '@/lib/server/po'

const STATUSES: PoStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']

/** GET /api/purchase-orders?status=ACTIVE|ARCHIVED|<status>&q= */
export const GET = route(['ADMIN'], async req => {
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || 'ALL'
  const q = sp.get('q')?.trim()
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(status === 'ACTIVE' ? { status: { in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] } } : status === 'ARCHIVED' ? { status: { in: ['RECEIVED', 'CANCELLED'] } } : STATUSES.includes(status as PoStatus) ? { status: status as PoStatus } : {}),
    ...(q ? { OR: [{ poNumber: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }, { items: { some: { medicine: { name: { contains: q, mode: 'insensitive' } } } } }] } : {}),
  }
  const [pos, grouped] = await Promise.all([
    prisma.purchaseOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { supplier: { select: { id: true, name: true } }, items: true } }),
    prisma.purchaseOrder.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const counts = Object.fromEntries(STATUSES.map(s => [s, grouped.find(g => g.status === s)?._count._all ?? 0]))
  return { items: pos.map(poSummary), counts }
})

export const POST = route(['ADMIN'], async (req, { user }) => {
  const data = await body(req, poCreateSchema)
  // merge duplicate medicine lines
  const merged = new Map<string, { medicineId: string; quantity: number; unitCost?: number | null }>()
  for (const i of data.items) {
    const cur = merged.get(i.medicineId)
    merged.set(i.medicineId, cur ? { ...cur, quantity: cur.quantity + i.quantity } : { ...i })
  }
  return prisma.$transaction(async tx => {
    const poNumber = await nextNumber(tx, `PO-${new Date().getFullYear()}`, n => `PO-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`)
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: data.supplierId,
        notes: data.notes || null,
        status: data.status,
        orderedAt: data.status === 'ORDERED' ? new Date() : null,
        createdById: user.id,
        items: { create: [...merged.values()].map(i => ({ medicineId: i.medicineId, quantityOrdered: i.quantity, unitCost: i.unitCost ?? null })) },
      },
      include: { supplier: { select: { id: true, name: true } }, items: true },
    })
    return poSummary(po)
  })
})
