import { HttpError } from './api'

export type ExtractedItem = {
  medicineName: string
  genericName: string
  category: string
  matchedMedicine: string
  batchNumber: string
  expiryDate: string
  quantity: number
  tradePrice: number
  mrp: number
  confidence: number
}
export type Extraction = { supplierName: string; billNumber: string; billDate: string; totalAmount: number; items: ExtractedItem[] }

const responseSchema = {
  type: 'OBJECT',
  properties: {
    supplierName: { type: 'STRING', description: 'Distributor / supplier company name printed on the bill' },
    billNumber: { type: 'STRING', description: 'Invoice / bill number' },
    billDate: { type: 'STRING', description: 'Invoice date as YYYY-MM-DD, empty if missing' },
    totalAmount: { type: 'NUMBER', description: 'Grand total / net payable on the bill' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          medicineName: { type: 'STRING', description: 'Brand name with strength and form, e.g. "Panadol 500mg"' },
          genericName: { type: 'STRING', description: 'Generic / salt formula if printed or well known, else empty' },
          category: { type: 'STRING', description: 'Best-fit category, preferably one of the known categories' },
          matchedMedicine: { type: 'STRING', description: 'Exact name from the known medicine list if this is the same product, else empty' },
          batchNumber: { type: 'STRING' },
          expiryDate: { type: 'STRING', description: 'YYYY-MM-DD. For MM/YY or MM/YYYY use the last day of that month.' },
          quantity: { type: 'INTEGER', description: 'Total units received (billed qty + bonus/free qty)' },
          tradePrice: { type: 'NUMBER', description: 'Purchase (trade) price per unit' },
          mrp: { type: 'NUMBER', description: 'Maximum retail price per unit' },
          confidence: { type: 'NUMBER', description: '0 to 1: how confident you are this row was read correctly' },
        },
        required: ['medicineName', 'genericName', 'category', 'matchedMedicine', 'batchNumber', 'expiryDate', 'quantity', 'tradePrice', 'mrp', 'confidence'],
      },
    },
  },
  required: ['supplierName', 'billNumber', 'billDate', 'totalAmount', 'items'],
}

function prompt(categories: string[], medicines: string[]) {
  return `You are a pharmacy back-office assistant. Extract every medicine line item from this distributor / supplier invoice.
Rules:
- One output item per invoice row. Ignore subtotal, tax and discount rows.
- quantity = number of saleable units received for that row, including bonus/free units.
- tradePrice = purchase price per unit after line discount when shown; mrp = retail price per unit. If a price is shown per pack, keep it per pack consistently with quantity.
- expiryDate must be YYYY-MM-DD. "08/27" or "Aug-2027" means 2027-08-31.
- category: choose from known categories when reasonable: ${categories.join(', ') || 'Tablets, Capsules, Syrups, Injections, Drops, Ointments, Medical devices, Nutraceuticals'}.
- matchedMedicine: if the row is the same product as one of these known medicines, copy that exact name, otherwise "": ${medicines.slice(0, 400).join(' | ') || '(none)'}
- Use "" or 0 for anything you cannot read; lower confidence for blurry or ambiguous rows. Never invent rows.`
}

async function callModel(model: string, apiKey: string, mimeType: string, base64: string, text: string, timeoutMs: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema },
      }),
    })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false as const, status: res.status, message: json?.error?.message ?? res.statusText }
    const out = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
    if (!out) return { ok: false as const, status: 422, message: json?.promptFeedback?.blockReason ? `Blocked: ${json.promptFeedback.blockReason}` : 'Empty response from model' }
    return { ok: true as const, data: JSON.parse(out) as Extraction }
  } catch (e: any) {
    return { ok: false as const, status: e?.name === 'AbortError' ? 504 : 502, message: e?.message ?? 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Sends the bill to Gemini, retrying transient errors and falling back across configured models. */
export async function extractBill(file: { mimeType: string; base64: string }, ctx: { categories: string[]; medicines: string[] }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new HttpError(500, 'GEMINI_API_KEY is not configured on the server')
  const models = [process.env.GEMINI_MODEL || 'gemini-3.5-flash', ...(process.env.GEMINI_FALLBACK_MODELS || '').split(',')].map(s => s.trim()).filter(Boolean)
  const text = prompt(ctx.categories, ctx.medicines)
  const errors: string[] = []
  // Hard overall budget so the scanner never hangs: ~110s across all models/retries.
  const deadline = Date.now() + 110_000
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now()
      if (remaining < 5_000) break
      const r = await callModel(model, apiKey, file.mimeType, file.base64, text, Math.min(60_000, remaining))
      if (r.ok) return { model, extraction: normalize(r.data) }
      errors.push(`${model}: ${r.status} ${r.message}`)
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new HttpError(502, `AI service rejected the request: ${r.message}`)
      if (r.status === 404 || r.status === 504) break // unavailable or too slow — move on to the next model
      if (r.status === 429 || r.status >= 500) { await sleep(1200); continue }
      break
    }
  }
  console.error('[gemini] all models failed', errors)
  throw new HttpError(503, 'The AI scanner is busy right now. Please try again in a minute, or enter the stock manually.', errors)
}

function normalize(e: Extraction): Extraction {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0)
  return {
    supplierName: e?.supplierName?.trim() ?? '',
    billNumber: e?.billNumber?.trim() ?? '',
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(e?.billDate ?? '') ? e.billDate : '',
    totalAmount: num(e?.totalAmount),
    items: (e?.items ?? []).filter(i => i?.medicineName?.trim()).map(i => ({
      medicineName: i.medicineName.trim(),
      genericName: i.genericName?.trim() ?? '',
      category: i.category?.trim() ?? '',
      matchedMedicine: i.matchedMedicine?.trim() ?? '',
      batchNumber: (i.batchNumber ?? '').trim().toUpperCase(),
      expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(i.expiryDate ?? '') ? i.expiryDate : '',
      quantity: Math.max(0, Math.round(num(i.quantity))),
      tradePrice: num(i.tradePrice),
      mrp: num(i.mrp),
      confidence: Math.min(1, Math.max(0, num(i.confidence))),
    })),
  }
}
