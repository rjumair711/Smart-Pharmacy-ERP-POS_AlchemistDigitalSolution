import { Prisma } from '@prisma/client'
import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { customerReturnSchema } from '@/lib/server/schemas'
import { money, nextNumber } from '@/lib/server/util'

export const GET = route(null, async req => {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const rows = await prisma.customerReturn.findMany({
    where: q ? { OR: [{ returnNumber: { contains: q, mode: 'insensitive' } }, { sale: { invoiceNumber: { contains: q, mode: 'insensitive' } } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { sale: { select: { invoiceNumber: true, customerName: true } }, processedBy: { select: { name: true } }, items: { select: { quantity: true } } },
  })
  return rows.map(r => ({ id: r.id, returnNumber: r.returnNumber, invoiceNumber: r.sale.invoiceNumber, customerName: r.sale.customerName, refundAmount: r.refundAmount, units: r.items.reduce((s, i) => s + i.quantity, 0), reason: r.reason, processedBy: r.processedBy.name, createdAt: r.createdAt }))
})

/**
 * Sales return: validates quantities against what was sold (minus earlier returns),
 * restocks resalable units into their ORIGINAL batch, and issues a credit note.
 * Refunds are prorated so invoice-level discount and tax are returned proportionally.
 */
export const POST = route(null, async (req, { user }) => {
  const data = await body(req, customerReturnSchema)
  const result = await prisma.$transaction(async tx => {
    const sale = await tx.sale.findUnique({ where: { id: data.saleId } })
    if (!sale) throw new HttpError(404, 'Original invoice not found')
    const ids = [...new Set(data.items.map(i => i.saleItemId))]
    if (ids.length !== data.items.length) throw new HttpError(400, 'Each invoice line can appear only once')
    // Lock the invoice lines so two counters cannot return the same units twice.
    await tx.$queryRaw`SELECT id FROM "SaleItem" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`
    const saleItems = await tx.saleItem.findMany({ where: { id: { in: ids }, saleId: sale.id }, include: { medicine: { select: { name: true } } } })
    if (saleItems.length !== ids.length) throw new HttpError(400, 'One or more lines do not belong to this invoice')

    const ratio = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1
    let refund = 0, restockedCost = 0
    const lines: { saleItemId: string; quantity: number; refundAmount: number; restocked: boolean }[] = []
    for (const r of data.items) {
      const si = saleItems.find(s => s.id === r.saleItemId)!
      const remaining = si.quantity - si.returnedQuantity
      if (r.quantity > remaining) throw new HttpError(400, `${si.medicine.name}: only ${remaining} unit(s) can still be returned (sold ${si.quantity}, already returned ${si.returnedQuantity})`)
      const lineRefund = money(Number(si.unitPrice) * r.quantity * ratio)
      refund += lineRefund
      await tx.saleItem.update({ where: { id: si.id }, data: { returnedQuantity: { increment: r.quantity } } })
      if (r.restock) {
        await tx.medicineBatch.update({ where: { id: si.batchId }, data: { quantity: { increment: r.quantity } } })
        restockedCost += Number(si.unitCost) * r.quantity
      }
      lines.push({ saleItemId: si.id, quantity: r.quantity, refundAmount: lineRefund, restocked: r.restock })
    }
    const returnNumber = await nextNumber(tx, 'CR', n => `CR-${String(n).padStart(5, '0')}`)
    const cr = await tx.customerReturn.create({
      data: { returnNumber, saleId: sale.id, processedById: user.id, reason: data.reason || null, refundAmount: money(refund), restockedCost: money(restockedCost), items: { createMany: { data: lines } } },
    })
    const restockLines = lines.filter(l => l.restocked)
    if (restockLines.length) {
      await tx.stockMovement.createMany({ data: restockLines.map(l => ({ batchId: saleItems.find(s => s.id === l.saleItemId)!.batchId, type: 'CUSTOMER_RETURN' as const, quantity: l.quantity, reference: `${returnNumber} / ${sale.invoiceNumber}`, userId: user.id })) })
    }
    return cr
  }, { timeout: 30_000, maxWait: 10_000 })
  return { id: result.id, returnNumber: result.returnNumber, refundAmount: result.refundAmount }
})
