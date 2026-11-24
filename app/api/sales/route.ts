import type { Prisma } from '@prisma/client'
import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { saleSchema } from '@/lib/server/schemas'
import { allocateFefo } from '@/lib/server/stock'
import { getSettings, localDayStart, money, nextNumber } from '@/lib/server/util'

/** GET /api/sales?q=&from=YYYY-MM-DD&to=YYYY-MM-DD&page= */
export const GET = route(null, async req => {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim()
  const page = Math.max(1, Number(sp.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') || 20)))
  const from = sp.get('from'), to = sp.get('to')
  const range: Prisma.DateTimeFilter = {}
  if (from) range.gte = localDayStart(from)
  if (to) range.lt = new Date(localDayStart(to).getTime() + 86_400_000)
  const where: Prisma.SaleWhereInput = {
    ...(from || to ? { createdAt: range } : {}),
    ...(q ? { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }, { customerPhone: { contains: q } }] } : {}),
  }
  const [rows, total, agg, returns] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { cashier: { select: { name: true } }, items: { select: { quantity: true, returnedQuantity: true } }, _count: { select: { returns: true } } } }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where, _sum: { total: true }, _count: true }),
    prisma.customerReturn.aggregate({ where: from || to ? { createdAt: range } : {}, _sum: { refundAmount: true }, _count: true }),
  ])
  return {
    items: rows.map(s => ({
      id: s.id, invoiceNumber: s.invoiceNumber, createdAt: s.createdAt, cashier: s.cashier.name, customerName: s.customerName, paymentMethod: s.paymentMethod,
      itemCount: s.items.reduce((x, i) => x + i.quantity, 0), total: s.total,
      status: s.items.every(i => i.returnedQuantity >= i.quantity) ? 'Refunded' : s._count.returns > 0 ? 'Partially returned' : 'Completed',
    })),
    total, page, pageSize,
    summary: { count: agg._count, revenue: Number(agg._sum.total ?? 0), average: agg._count ? Number(agg._sum.total ?? 0) / agg._count : 0, returns: returns._count, refunded: Number(returns._sum.refundAmount ?? 0) },
  }
})

/** POST /api/sales — POS checkout with FEFO batch allocation (all roles). */
export const POST = route(null, async (req, { user }) => {
  const data = await body(req, saleSchema)
  const qtyByMed = new Map<string, number>()
  for (const i of data.items) qtyByMed.set(i.medicineId, (qtyByMed.get(i.medicineId) ?? 0) + i.quantity)

  const sale = await prisma.$transaction(async tx => {
    const settings = await getSettings(tx)
    const meds = await tx.medicine.findMany({ where: { id: { in: [...qtyByMed.keys()] } }, select: { id: true, name: true, active: true } })
    const lines: Prisma.SaleItemCreateManySaleInput[] = []
    let subtotal = 0, cost = 0
    for (const [medicineId, qty] of qtyByMed) {
      const med = meds.find(m => m.id === medicineId)
      if (!med || !med.active) throw new HttpError(400, 'A medicine in the cart is no longer available')
      const alloc = await allocateFefo(tx, medicineId, qty)
      if (!alloc.ok) throw new HttpError(409, `Only ${alloc.available} unit(s) of ${med.name} are available in non-expired batches`)
      for (const { batch, take } of alloc.allocations) {
        const price = Number(batch.mrp), unitCost = Number(batch.purchasePrice)
        subtotal += price * take
        cost += unitCost * take
        lines.push({ medicineId, batchId: batch.id, quantity: take, unitPrice: price, unitCost, lineTotal: money(price * take) })
      }
    }
    subtotal = money(subtotal)
    if (data.discount > subtotal) throw new HttpError(400, 'Discount cannot exceed the subtotal')
    const taxable = subtotal - data.discount
    const tax = money(taxable * Number(settings.taxRate) / 100)
    const total = money(taxable + tax)
    const invoiceNumber = await nextNumber(tx, 'INV', n => `${settings.invoicePrefix}${String(n).padStart(5, '0')}`)
    const created = await tx.sale.create({
      data: {
        invoiceNumber, cashierId: user.id, customerName: data.customerName || null, customerPhone: data.customerPhone || null,
        paymentMethod: data.paymentMethod, subtotal, discount: data.discount, tax, total, costTotal: money(cost),
        items: { createMany: { data: lines } },
      },
      include: { items: true },
    })
    await tx.stockMovement.createMany({ data: created.items.map(i => ({ batchId: i.batchId, type: 'SALE' as const, quantity: -i.quantity, reference: invoiceNumber, userId: user.id })) })
    return created
  }, { timeout: 30_000, maxWait: 10_000 })
  return { id: sale.id, invoiceNumber: sale.invoiceNumber, total: sale.total }
})
