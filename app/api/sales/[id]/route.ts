import { HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { getSettings } from '@/lib/server/util'

/** GET /api/sales/:idOrInvoiceNumber — invoice with items, batches and return history (receipt + customer return lookup) */
export const GET = route(null, async (_req, { params, user }) => {
  const key = decodeURIComponent(params.id).trim()
  const sale = await prisma.sale.findFirst({
    where: { OR: [{ id: key }, { invoiceNumber: { equals: key, mode: 'insensitive' } }] },
    include: {
      cashier: { select: { name: true } },
      items: { orderBy: { id: 'asc' }, include: { medicine: { select: { name: true, genericName: true } }, batch: { select: { batchNumber: true, expiryDate: true } } } },
      returns: { orderBy: { createdAt: 'asc' }, include: { processedBy: { select: { name: true } } } },
    },
  })
  if (!sale) throw new HttpError(404, `No invoice found for "${key}"`)
  const settings = await getSettings(prisma)
  const isAdmin = user.role === 'ADMIN'
  return {
    ...sale,
    costTotal: isAdmin ? sale.costTotal : undefined,
    cashier: sale.cashier.name,
    items: sale.items.map(i => ({
      id: i.id, medicineId: i.medicineId, name: i.medicine.name, genericName: i.medicine.genericName, batchNumber: i.batch.batchNumber, expiryDate: i.batch.expiryDate.toISOString().slice(0, 10),
      quantity: i.quantity, returnedQuantity: i.returnedQuantity, returnable: i.quantity - i.returnedQuantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, unitCost: isAdmin ? i.unitCost : undefined,
    })),
    returns: sale.returns.map(r => ({ id: r.id, returnNumber: r.returnNumber, refundAmount: r.refundAmount, createdAt: r.createdAt, processedBy: r.processedBy.name })),
    pharmacy: { name: settings.pharmacyName, address: settings.address, phone: settings.phone, footer: settings.receiptFooter, format: settings.receiptFormat, taxRate: settings.taxRate, currency: settings.currency },
  }
})
