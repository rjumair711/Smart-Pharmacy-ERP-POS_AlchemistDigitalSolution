import { z } from 'zod'

const optText = (max: number) => z.string().trim().max(max).optional().nullable()
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)')

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optText(200),
  color: z.enum(['mint', 'blue', 'amber', 'violet', 'rose', 'slate', 'green']).optional(),
})

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: optText(120),
  phone: optText(40),
  email: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  address: optText(250),
  active: z.boolean().optional(),
})

export const medicineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  genericName: optText(160),
  manufacturer: optText(120),
  barcode: z.string().trim().max(64).optional().nullable().transform(v => v || null),
  unit: z.string().trim().max(20).optional(),
  categoryId: z.string().min(1),
  lowStockThreshold: z.number().int().min(0).max(100000).optional().nullable(),
  expiryLeadDays: z.number().int().min(0).max(730).optional().nullable(),
  active: z.boolean().optional(),
})

export const stockLineSchema = z.object({
  medicineId: z.string().optional().nullable(),
  newMedicine: z.object({
    name: z.string().trim().min(2).max(120),
    genericName: optText(160),
    categoryId: z.string().optional().nullable(),
    categoryName: optText(60),
    manufacturer: optText(120),
    lowStockThreshold: z.number().int().min(0).optional().nullable(),
  }).optional().nullable(),
  batchNumber: z.string().trim().min(1).max(40),
  expiryDate: dateString,
  quantity: z.number().int().positive().max(1_000_000),
  purchasePrice: z.number().min(0).max(10_000_000),
  mrp: z.number().min(0).max(10_000_000),
}).refine(l => l.medicineId || l.newMedicine, { message: 'Select a medicine or provide a new medicine name' })

export const receiveSchema = z.object({
  supplierId: z.string().optional().nullable(),
  purchaseOrderId: z.string().optional().nullable(),
  reconcile: z.boolean().default(true),
  lines: z.array(stockLineSchema).min(1).max(300),
})

export const billConfirmSchema = receiveSchema.extend({
  billNumber: optText(60),
  billDate: dateString.optional().nullable().or(z.literal('')),
  totalAmount: z.number().min(0).optional().nullable(),
  fileName: optText(200),
  aiModel: optText(80),
  rawExtraction: z.unknown().optional(),
})

export const poCreateSchema = z.object({
  supplierId: z.string().min(1),
  notes: optText(500),
  status: z.enum(['DRAFT', 'ORDERED']).default('ORDERED'),
  items: z.array(z.object({ medicineId: z.string().min(1), quantity: z.number().int().positive().max(1_000_000), unitCost: z.number().min(0).optional().nullable() })).min(1).max(300),
})

export const saleSchema = z.object({
  customerName: optText(120),
  customerPhone: optText(40),
  paymentMethod: z.enum(['CASH', 'CARD', 'WALLET']).default('CASH'),
  discount: z.number().min(0).default(0),
  items: z.array(z.object({ medicineId: z.string().min(1), quantity: z.number().int().positive().max(10_000) })).min(1).max(200),
})

export const customerReturnSchema = z.object({
  saleId: z.string().min(1),
  reason: optText(300),
  items: z.array(z.object({ saleItemId: z.string().min(1), quantity: z.number().int().positive(), restock: z.boolean().default(true) })).min(1),
})

export const supplierReturnSchema = z.object({
  supplierId: z.string().min(1),
  reason: z.enum(['EXPIRED', 'NEAR_EXPIRY', 'DAMAGED', 'EXCESS', 'OTHER']),
  notes: optText(500),
  items: z.array(z.object({ batchId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(200),
})

export const settingsSchema = z.object({
  pharmacyName: z.string().trim().min(2).max(120),
  phone: optText(40),
  email: optText(120),
  address: optText(250),
  currency: z.string().trim().min(1).max(8),
  taxRate: z.number().min(0).max(100),
  invoicePrefix: z.string().trim().min(1).max(10),
  receiptFormat: z.enum(['thermal', 'a4']),
  receiptFooter: optText(250),
  expiryAlertsEnabled: z.boolean(),
  expiryLeadDays: z.number().int().min(1).max(730),
  lowStockAlertsEnabled: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(100000),
}).partial()

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'must be at least 8 characters').max(128),
  role: z.enum(['ADMIN', 'CASHIER']),
})
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['ADMIN', 'CASHIER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
})
