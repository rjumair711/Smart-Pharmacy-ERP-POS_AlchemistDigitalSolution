import { HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { getSettings } from '@/lib/server/util'

/** Credit / refund receipt */
export const GET = route(null, async (_req, { params }) => {
  const r = await prisma.customerReturn.findFirst({
    where: { OR: [{ id: params.id }, { returnNumber: params.id }] },
    include: {
      sale: { select: { id: true, invoiceNumber: true, customerName: true, customerPhone: true, createdAt: true, paymentMethod: true } },
      processedBy: { select: { name: true } },
      items: { include: { saleItem: { include: { medicine: { select: { name: true } }, batch: { select: { batchNumber: true } } } } } },
    },
  })
  if (!r) throw new HttpError(404, 'Return not found')
  const settings = await getSettings(prisma)
  return {
    id: r.id, returnNumber: r.returnNumber, createdAt: r.createdAt, reason: r.reason, refundAmount: r.refundAmount, processedBy: r.processedBy.name, sale: r.sale,
    items: r.items.map(i => ({ id: i.id, name: i.saleItem.medicine.name, batchNumber: i.saleItem.batch.batchNumber, quantity: i.quantity, unitPrice: i.saleItem.unitPrice, refundAmount: i.refundAmount, restocked: i.restocked })),
    pharmacy: { name: settings.pharmacyName, address: settings.address, phone: settings.phone, footer: settings.receiptFooter, currency: settings.currency },
  }
})
