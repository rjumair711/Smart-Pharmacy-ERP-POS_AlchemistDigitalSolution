import { HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { getSettings } from '@/lib/server/util'

/** Debit note document */
export const GET = route(['ADMIN'], async (_req, { params }) => {
  const r = await prisma.supplierReturn.findFirst({
    where: { OR: [{ id: params.id }, { debitNoteNumber: params.id }] },
    include: {
      supplier: true,
      processedBy: { select: { name: true } },
      items: { include: { batch: { select: { batchNumber: true, expiryDate: true, medicine: { select: { name: true } } } } } },
    },
  })
  if (!r) throw new HttpError(404, 'Debit note not found')
  const settings = await getSettings(prisma)
  return {
    ...r,
    processedBy: r.processedBy.name,
    items: r.items.map(i => ({ id: i.id, name: i.batch.medicine.name, batchNumber: i.batch.batchNumber, expiryDate: i.batch.expiryDate.toISOString().slice(0, 10), quantity: i.quantity, unitCost: i.unitCost, lineTotal: i.lineTotal })),
    pharmacy: { name: settings.pharmacyName, address: settings.address, phone: settings.phone, currency: settings.currency },
  }
})
