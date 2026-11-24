import { HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { extractBill } from '@/lib/server/gemini'

export const maxDuration = 120

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 15 * 1024 * 1024

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** POST multipart { file } — sends the supplier bill to the vision model and returns an editable, pre-matched table. */
export const POST = route(['ADMIN'], async req => {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'Attach a JPG, PNG or PDF supplier bill')
  if (!ALLOWED.includes(file.type)) throw new HttpError(415, 'Only JPG, PNG, WEBP or PDF files are supported')
  if (file.size > MAX_BYTES) throw new HttpError(413, 'File is larger than 15 MB')
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const [categories, medicines, suppliers] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.medicine.findMany({ where: { active: true }, select: { id: true, name: true, genericName: true, categoryId: true } }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ])
  const { model, extraction } = await extractBill({ mimeType: file.type, base64 }, { categories: categories.map(c => c.name), medicines: medicines.map(m => m.name) })

  const medByName = new Map(medicines.map(m => [norm(m.name), m]))
  const catByName = new Map(categories.map(c => [norm(c.name), c]))
  const supplier = extraction.supplierName
    ? suppliers.find(s => norm(s.name) === norm(extraction.supplierName)) ?? suppliers.find(s => norm(extraction.supplierName).includes(norm(s.name).slice(0, 6)) || norm(s.name).includes(norm(extraction.supplierName).slice(0, 6)))
    : undefined

  const items = extraction.items.map(i => {
    const med = medByName.get(norm(i.matchedMedicine)) ?? medByName.get(norm(i.medicineName))
    const cat = med ? categories.find(c => c.id === med.categoryId) : catByName.get(norm(i.category)) ?? [...catByName.entries()].find(([k]) => norm(i.category).startsWith(k.slice(0, 5)))?.[1]
    const issues: string[] = []
    if (!i.batchNumber) issues.push('Missing batch number')
    if (!i.expiryDate) issues.push('Missing expiry date')
    if (!i.quantity) issues.push('Missing quantity')
    if (i.mrp && i.tradePrice && i.tradePrice > i.mrp) issues.push('Trade price above MRP')
    if (!med) issues.push('New medicine — will be created')
    return { ...i, medicineId: med?.id ?? null, categoryId: cat?.id ?? null, categoryName: cat?.name ?? (i.category || 'Uncategorized'), issues }
  })

  const openPos = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] }, ...(supplier ? { supplierId: supplier.id } : {}) },
    select: { id: true, poNumber: true, supplier: { select: { name: true } } },
    orderBy: { orderedAt: 'asc' },
  })

  return {
    model,
    fileName: file.name,
    supplierName: extraction.supplierName,
    supplierId: supplier?.id ?? null,
    billNumber: extraction.billNumber,
    billDate: extraction.billDate,
    totalAmount: extraction.totalAmount,
    items,
    openPurchaseOrders: openPos,
    raw: extraction,
  }
})
