/**
 * Demo data seed.  Usage:
 *   pnpm db:seed           (only seeds an empty database)
 *   pnpm db:seed --reset   (wipes ALL data first)
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()
const DAY = 86_400_000
const id = () => randomUUID().replace(/-/g, '').slice(0, 25)
const money = (v: number) => Math.round(v * 100) / 100

// deterministic PRNG so every seed produces the same demo story
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

const now = new Date()
const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
const dateIn = (days: number) => new Date(todayUtc.getTime() + days * DAY)

async function main() {
  const reset = process.argv.includes('--reset')
  const existing = await prisma.user.count()
  if (existing > 0 && !reset) {
    console.log('Database already has data. Run with --reset to wipe and reseed.')
    return
  }
  if (reset) {
    console.log('Resetting database…')
    await prisma.$transaction([
      prisma.stockMovement.deleteMany(), prisma.customerReturnItem.deleteMany(), prisma.customerReturn.deleteMany(),
      prisma.supplierReturnItem.deleteMany(), prisma.supplierReturn.deleteMany(), prisma.saleItem.deleteMany(), prisma.sale.deleteMany(),
      prisma.poReceipt.deleteMany(), prisma.purchaseOrderItem.deleteMany(), prisma.purchaseOrder.deleteMany(),
      prisma.medicineBatch.deleteMany(), prisma.supplierBill.deleteMany(), prisma.medicine.deleteMany(), prisma.category.deleteMany(),
      prisma.supplier.deleteMany(), prisma.user.deleteMany(), prisma.counter.deleteMany(), prisma.setting.deleteMany(),
    ])
  }

  // ── Users ──────────────────────────────────────────────────────────────
  const [adminHash, cashierHash] = await Promise.all([bcrypt.hash('Admin@123', 10), bcrypt.hash('Cashier@123', 10)])
  const users = [
    { id: id(), name: 'Dr. Ahmed Ali', email: 'admin@noorcare.pk', passwordHash: adminHash, role: 'ADMIN' as const },
    { id: id(), name: 'Ayesha Khan', email: 'cashier@noorcare.pk', passwordHash: cashierHash, role: 'CASHIER' as const },
    { id: id(), name: 'Bilal Ahmed', email: 'bilal@noorcare.pk', passwordHash: cashierHash, role: 'CASHIER' as const },
    { id: id(), name: 'Sara Malik', email: 'sara@noorcare.pk', passwordHash: cashierHash, role: 'CASHIER' as const, active: false },
  ]
  await prisma.user.createMany({ data: users })
  const admin = users[0], cashiers = users.slice(1, 3)

  await prisma.setting.create({ data: { id: 1 } })

  // ── Categories ────────────────────────────────────────────────────────
  const catDefs: [string, string, string][] = [
    ['Tablets', 'Common solid-dose medicines', 'mint'], ['Capsules', 'Hard and soft gelatin capsules', 'blue'],
    ['Syrups', 'Oral liquids and suspensions', 'amber'], ['Injections', 'Injectable medicines and vaccines', 'violet'],
    ['Drops', 'Eye, ear, and oral drops', 'blue'], ['Ointments', 'Topical creams, gels, and ointments', 'rose'],
    ['Medical devices', 'Surgical & medical supplies', 'slate'], ['Nutraceuticals', 'Vitamins and supplements', 'green'],
    ['Sachets', 'Powders and oral rehydration sachets', 'amber'],
  ]
  const cats = Object.fromEntries(catDefs.map(([name, description, color]) => [name, { id: id(), name, description, color }]))
  await prisma.category.createMany({ data: Object.values(cats) })

  // ── Suppliers ─────────────────────────────────────────────────────────
  const supDefs: [string, string, string, string][] = [
    ['Getz Pharma', 'Fahad Iqbal', '+92 51 234 5678', 'orders@getz.example'],
    ['GSK Pakistan', 'Sana Raza', '+92 21 345 6789', 'supply@gsk.example'],
    ['Sami Pharmaceuticals', 'Usman Tariq', '+92 42 567 8901', 'sales@sami.example'],
    ['Abbott Laboratories', 'Hira Ahmed', '+92 21 456 7890', 'orders@abbott.example'],
    ['Ferozsons Laboratories', 'Ali Hassan', '+92 42 345 6789', 'info@ferozsons.example'],
  ]
  const sups = Object.fromEntries(supDefs.map(([name, contactPerson, phone, email]) => [name, { id: id(), name, contactPerson, phone, email, address: 'Pakistan' }]))
  await prisma.supplier.createMany({ data: Object.values(sups) })

  // ── Medicines & batches ───────────────────────────────────────────────
  // [name, generic, category, manufacturer/supplier, tradePrice, mrp, batches: [daysToExpiry, qty][] , threshold?]
  type MedDef = [string, string, string, string, number, number, [number, number][], number?]
  const medDefs: MedDef[] = [
    ['Panadol 500mg', 'Paracetamol', 'Tablets', 'Getz Pharma', 19, 28, [[55, 160], [420, 200]]],
    ['Augmentin 625mg', 'Amoxicillin + Clavulanate', 'Tablets', 'GSK Pakistan', 390, 485, [[20, 30], [300, 30]], 40],
    ['Brufen 400mg', 'Ibuprofen', 'Tablets', 'Abbott Laboratories', 24, 32, [[400, 220]]],
    ['Zyrtec 10mg', 'Cetirizine HCl', 'Tablets', 'Getz Pharma', 31, 42, [[250, 40]]],
    ['Flagyl 400mg', 'Metronidazole', 'Tablets', 'Sami Pharmaceuticals', 15, 21, [[-12, 35]]],
    ['Glucophage 500mg', 'Metformin', 'Tablets', 'Getz Pharma', 9, 13, [[330, 400]]],
    ['Risek 20mg', 'Omeprazole', 'Capsules', 'Getz Pharma', 27, 36, [[180, 150], [500, 100]]],
    ['Amoxil 500mg', 'Amoxicillin', 'Capsules', 'GSK Pakistan', 22, 30, [[150, 120]]],
    ['Vitamin D3 200,000 IU', 'Cholecalciferol', 'Capsules', 'Sami Pharmaceuticals', 88, 115, [[260, 70]]],
    ['ORS Sachets', 'Oral Rehydration Salts', 'Sachets', 'Ferozsons Laboratories', 29, 38, [[7, 80], [365, 60]]],
    ['Hydryllin Syrup 120ml', 'Diphenhydramine + Ammonium Chloride', 'Syrups', 'Searle', 95, 125, [[10, 70]]],
    ['Calpol Suspension 90ml', 'Paracetamol', 'Syrups', 'GSK Pakistan', 72, 95, [[240, 60]]],
    ['Insulin Mixtard 100IU', 'Human insulin', 'Injections', 'Abbott Laboratories', 640, 780, [[45, 45]], 10],
    ['Ceftriaxone 1g Injection', 'Ceftriaxone', 'Injections', 'Sami Pharmaceuticals', 160, 210, [[200, 40]]],
    ['Tobradex Eye Drops', 'Tobramycin + Dexamethasone', 'Drops', 'Abbott Laboratories', 230, 295, [[90, 45]]],
    ['Polyfax Ointment', 'Polymyxin B + Bacitracin', 'Ointments', 'GSK Pakistan', 120, 155, [[310, 45]]],
    ['Digital Thermometer', '', 'Medical devices', 'Ferozsons Laboratories', 260, 390, [[1500, 40]], 5],
    ['Surgical Gloves (pair)', '', 'Medical devices', 'Ferozsons Laboratories', 18, 30, [[900, 300]]],
    ['Centrum Multivitamin', 'Multivitamin & minerals', 'Nutraceuticals', 'Abbott Laboratories', 38, 52, [[420, 90]]],
    ['Surbex-Z', 'Vitamin B complex + Zinc', 'Nutraceuticals', 'Abbott Laboratories', 14, 19, [[380, 160]]],
  ]
  type Batch = { id: string; medicineId: string; supplierId: string | null; batchNumber: string; expiryDate: Date; quantity: number; receivedQty: number; purchasePrice: number; mrp: number; source: 'OPENING'; receivedAt: Date }
  const medicines: { id: string; name: string; genericName: string | null; manufacturer: string; categoryId: string; lowStockThreshold: number | null; barcode: string }[] = []
  const batches: Batch[] = []
  medDefs.forEach(([name, generic, cat, maker, tp, mrp, bs, threshold], mi) => {
    const medId = id()
    medicines.push({ id: medId, name, genericName: generic || null, manufacturer: maker, categoryId: cats[cat].id, lowStockThreshold: threshold ?? null, barcode: `8964000${String(100000 + mi * 37).padStart(6, '0')}` })
    const prefix = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    bs.forEach(([days, qty], bi) => {
      // stock was received ~35-45 days ago so the 30-day sales history can draw from it
      batches.push({ id: id(), medicineId: medId, supplierId: sups[maker]?.id ?? sups['Ferozsons Laboratories'].id, batchNumber: `${prefix}-${24000 + mi * 11 + bi * 7}`, expiryDate: dateIn(days), quantity: qty, receivedQty: qty, purchasePrice: tp, mrp, source: 'OPENING', receivedAt: new Date(now.getTime() - (45 - bi * 5) * DAY) })
    })
  })
  await prisma.medicine.createMany({ data: medicines })

  // ── 30 days of sales history using FEFO allocation ──────────────────────
  type Sale = { id: string; invoiceNumber: string; cashierId: string; customerName: string | null; customerPhone: string | null; paymentMethod: 'CASH' | 'CARD' | 'WALLET'; subtotal: number; discount: number; tax: number; total: number; costTotal: number; createdAt: Date }
  type SaleItem = { id: string; saleId: string; medicineId: string; batchId: string; quantity: number; unitPrice: number; unitCost: number; lineTotal: number; returnedQuantity: number }
  const sales: Sale[] = [], saleItems: SaleItem[] = [], movements: { id: string; batchId: string; type: 'PURCHASE' | 'SALE' | 'CUSTOMER_RETURN'; quantity: number; reference: string; userId: string; createdAt: Date }[] = []
  for (const b of batches) movements.push({ id: id(), batchId: b.id, type: 'PURCHASE', quantity: b.receivedQty, reference: 'Opening stock', userId: admin.id, createdAt: b.receivedAt })
  const customers = ['Muhammad Ali', 'Fatima Noor', 'Hamza Sheikh', 'Zainab Bibi', 'Imran Qureshi', null, null, null, null]
  let inv = 0
  for (let d = 29; d >= 0; d--) {
    const salesToday = d === 0 ? 6 : int(4, 9)
    for (let s = 0; s < salesToday; s++) {
      const at = new Date(todayUtc.getTime() - d * DAY + (4 + s * 1.3) * 3600_000 + int(0, 50) * 60_000)
      if (at > now) continue
      const atDate = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
      const saleId = id()
      const lines: SaleItem[] = []
      for (let l = 0; l < int(1, 4); l++) {
        const med = pick(medicines)
        const want = int(1, 3)
        const valid = batches.filter(b => b.medicineId === med.id && b.quantity > 0 && b.expiryDate > atDate && b.receivedAt <= at).sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
        // keep a floor of ~12 units so the demo shows low-stock rather than empty shelves
        if (valid.reduce((x, v) => x + v.quantity, 0) - want < 12) continue
        let need = want
        for (const b of valid) {
          if (need <= 0) break
          if (lines.some(x => x.batchId === b.id)) break
          const take = Math.min(b.quantity, need)
          b.quantity -= take
          need -= take
          lines.push({ id: id(), saleId, medicineId: med.id, batchId: b.id, quantity: take, unitPrice: b.mrp, unitCost: b.purchasePrice, lineTotal: money(b.mrp * take), returnedQuantity: 0 })
        }
      }
      if (!lines.length) continue
      const subtotal = money(lines.reduce((x, i) => x + i.lineTotal, 0))
      const discount = subtotal > 1500 && rand() > 0.6 ? money(subtotal * 0.05) : 0
      inv++
      const cust = pick(customers)
      const invoiceNumber = `INV-${String(inv).padStart(5, '0')}`
      sales.push({ id: saleId, invoiceNumber, cashierId: pick(cashiers).id, customerName: cust, customerPhone: cust ? `+92 3${int(0, 4)}${int(0, 9)} ${int(1000000, 9999999)}` : null, paymentMethod: pick(['CASH', 'CASH', 'CARD', 'WALLET'] as const), subtotal, discount, tax: 0, total: money(subtotal - discount), costTotal: money(lines.reduce((x, i) => x + i.unitCost * i.quantity, 0)), createdAt: at })
      saleItems.push(...lines)
      for (const i of lines) movements.push({ id: id(), batchId: i.batchId, type: 'SALE', quantity: -i.quantity, reference: invoiceNumber, userId: admin.id, createdAt: at })
    }
  }

  // ── Purchase orders ───────────────────────────────────────────────────
  const med = (n: string) => medicines.find(m => m.name === n)!
  const batchOf = (n: string) => batches.filter(b => b.medicineId === med(n).id)
  const pos = [
    { id: id(), poNumber: `PO-${now.getFullYear()}-001`, supplierId: sups['Sami Pharmaceuticals'].id, status: 'RECEIVED' as const, orderedAt: new Date(now.getTime() - 46 * DAY), receivedAt: new Date(now.getTime() - 45 * DAY), createdById: admin.id, createdAt: new Date(now.getTime() - 46 * DAY) },
    { id: id(), poNumber: `PO-${now.getFullYear()}-002`, supplierId: sups['Getz Pharma'].id, status: 'PARTIALLY_RECEIVED' as const, orderedAt: new Date(now.getTime() - 42 * DAY), receivedAt: null, createdById: admin.id, createdAt: new Date(now.getTime() - 42 * DAY) },
    { id: id(), poNumber: `PO-${now.getFullYear()}-003`, supplierId: sups['GSK Pakistan'].id, status: 'ORDERED' as const, orderedAt: new Date(now.getTime() - 3 * DAY), receivedAt: null, createdById: admin.id, createdAt: new Date(now.getTime() - 3 * DAY) },
    { id: id(), poNumber: `PO-${now.getFullYear()}-004`, supplierId: sups['Abbott Laboratories'].id, status: 'DRAFT' as const, orderedAt: null, receivedAt: null, createdById: admin.id, createdAt: new Date(now.getTime() - 1 * DAY), notes: 'Monthly top-up — review before placing' },
  ]
  await prisma.purchaseOrder.createMany({ data: pos })
  const poItems = [
    { id: id(), purchaseOrderId: pos[0].id, medicineId: med('Flagyl 400mg').id, quantityOrdered: 35, quantityReceived: 35, unitCost: 15, status: 'RECEIVED' as const, lastReceivedAt: pos[0].receivedAt },
    { id: id(), purchaseOrderId: pos[0].id, medicineId: med('Ceftriaxone 1g Injection').id, quantityOrdered: 40, quantityReceived: 40, unitCost: 160, status: 'RECEIVED' as const, lastReceivedAt: pos[0].receivedAt },
    { id: id(), purchaseOrderId: pos[1].id, medicineId: med('Panadol 500mg').id, quantityOrdered: 160, quantityReceived: 160, unitCost: 19, status: 'RECEIVED' as const, lastReceivedAt: new Date(now.getTime() - 45 * DAY) },
    { id: id(), purchaseOrderId: pos[1].id, medicineId: med('Zyrtec 10mg').id, quantityOrdered: 100, quantityReceived: 40, unitCost: 31, status: 'PARTIAL' as const, lastReceivedAt: new Date(now.getTime() - 45 * DAY) },
    { id: id(), purchaseOrderId: pos[1].id, medicineId: med('Glucophage 500mg').id, quantityOrdered: 400, quantityReceived: 400, unitCost: 9, status: 'RECEIVED' as const, lastReceivedAt: new Date(now.getTime() - 45 * DAY) },
    { id: id(), purchaseOrderId: pos[2].id, medicineId: med('Augmentin 625mg').id, quantityOrdered: 80, quantityReceived: 0, unitCost: 390, status: 'PENDING' as const, lastReceivedAt: null },
    { id: id(), purchaseOrderId: pos[2].id, medicineId: med('Calpol Suspension 90ml').id, quantityOrdered: 40, quantityReceived: 0, unitCost: 72, status: 'PENDING' as const, lastReceivedAt: null },
    { id: id(), purchaseOrderId: pos[2].id, medicineId: med('Amoxil 500mg').id, quantityOrdered: 100, quantityReceived: 0, unitCost: 22, status: 'PENDING' as const, lastReceivedAt: null },
    { id: id(), purchaseOrderId: pos[3].id, medicineId: med('Insulin Mixtard 100IU').id, quantityOrdered: 20, quantityReceived: 0, unitCost: 640, status: 'PENDING' as const, lastReceivedAt: null },
    { id: id(), purchaseOrderId: pos[3].id, medicineId: med('Tobradex Eye Drops').id, quantityOrdered: 24, quantityReceived: 0, unitCost: 230, status: 'PENDING' as const, lastReceivedAt: null },
  ]
  await prisma.purchaseOrderItem.createMany({ data: poItems })
  const receipts = [
    { id: id(), poItemId: poItems[0].id, batchId: batchOf('Flagyl 400mg')[0].id, quantity: 35 },
    { id: id(), poItemId: poItems[1].id, batchId: batchOf('Ceftriaxone 1g Injection')[0].id, quantity: 40 },
    { id: id(), poItemId: poItems[2].id, batchId: batchOf('Panadol 500mg')[0].id, quantity: 160 },
    { id: id(), poItemId: poItems[3].id, batchId: batchOf('Zyrtec 10mg')[0].id, quantity: 40 },
    { id: id(), poItemId: poItems[4].id, batchId: batchOf('Glucophage 500mg')[0].id, quantity: 400 },
  ]

  // ── a customer return on a recent invoice ────────────────────────────
  const returnSale = sales[sales.length - 8]
  const returnLine = saleItems.find(i => i.saleId === returnSale.id)!
  returnLine.returnedQuantity = 1
  const ratio = returnSale.total / returnSale.subtotal
  const crId = id()
  const batchOfLine = batches.find(b => b.id === returnLine.batchId)!
  batchOfLine.quantity += 1
  movements.push({ id: id(), batchId: returnLine.batchId, type: 'CUSTOMER_RETURN', quantity: 1, reference: `CR-00001 / ${returnSale.invoiceNumber}`, userId: cashiers[0].id, createdAt: new Date(returnSale.createdAt.getTime() + 3600_000) })

  await prisma.medicineBatch.createMany({ data: batches })
  await prisma.poReceipt.createMany({ data: receipts })
  await prisma.sale.createMany({ data: sales })
  for (let i = 0; i < saleItems.length; i += 1000) await prisma.saleItem.createMany({ data: saleItems.slice(i, i + 1000) })
  await prisma.customerReturn.create({ data: { id: crId, returnNumber: 'CR-00001', saleId: returnSale.id, processedById: cashiers[0].id, reason: 'Doctor changed prescription', refundAmount: money(returnLine.unitPrice * ratio), restockedCost: returnLine.unitCost, createdAt: new Date(returnSale.createdAt.getTime() + 3600_000), items: { create: { saleItemId: returnLine.id, quantity: 1, refundAmount: money(returnLine.unitPrice * ratio), restocked: true } } } })
  for (let i = 0; i < movements.length; i += 1000) await prisma.stockMovement.createMany({ data: movements.slice(i, i + 1000) })

  await prisma.counter.createMany({ data: [{ key: 'INV', value: inv }, { key: `PO-${now.getFullYear()}`, value: pos.length }, { key: 'CR', value: 1 }, { key: 'DN', value: 0 }] })

  console.log(`Seeded: ${users.length} users, ${Object.keys(cats).length} categories, ${Object.keys(sups).length} suppliers, ${medicines.length} medicines, ${batches.length} batches, ${sales.length} sales, ${pos.length} purchase orders.`)
  console.log('Admin login:   admin@noorcare.pk / Admin@123')
  console.log('Cashier login: cashier@noorcare.pk / Cashier@123')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
