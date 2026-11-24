# MediFlow AI — Smart Pharmacy ERP & POS

Full-stack pharmacy management: category-organised batch/expiry inventory, purchase orders with
**AI bill-to-stock auto-reconciliation**, FEFO POS billing, customer & supplier returns, configurable
alerts and financial reports.

**Stack:** Next.js 16 (App Router, route handlers) · PostgreSQL (Neon) · Prisma 6 · JWT session cookies (jose) + bcrypt · Zod · Google Gemini vision.

## Setup

```bash
pnpm install
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, GEMINI_API_KEY, AUTH_SECRET
pnpm db:migrate               # apply migrations (prisma migrate deploy)
pnpm db:seed                  # demo data (only on an empty DB); pnpm db:reset-demo wipes & reseeds
pnpm dev                      # http://localhost:3000
```

Production: `pnpm build && pnpm start`. Deploy the app in the **same region as the database**
(Neon `us-east-1` here) — every query is a network round trip.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection (runtime) |
| `DIRECT_URL` | Neon direct connection (migrations) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` | Primary vision model + comma-separated fallbacks (tried on 404/429/5xx/timeouts, ~110 s total budget) |
| `AUTH_SECRET` | ≥32 random chars for signing sessions |
| `PHARMACY_TZ` | Pharmacy timezone for "today", expiry and daily reports (default `Asia/Karachi`) |

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin / Pharmacist | `admin@noorcare.pk` | `Admin@123` |
| Cashier | `cashier@noorcare.pk` | `Cashier@123` |

Change these (Users & Roles) before real use. A sample supplier invoice lives at `public/demo-supplier-bill.png`
("Use demo invoice" in the AI Bill Scanner).

## How the core features work

**RBAC** — `proxy.ts` redirects pages optimistically; every API route re-checks session + role via
`route([roles], handler)` in `lib/server/api.ts`. Cashiers get POS, receipts, stock lookup, sales history and
customer returns only (no cost prices, no PO/settings/stock deletion).

**Schema** — `categories → medicines → medicine_batches` (batch no., expiry, qty, trade price, MRP), plus
purchase orders/items, PO receipts (batch ↔ PO line link), supplier bills, sales/sale items (per batch),
customer returns, supplier returns (debit notes), an audit `StockMovement` log, settings and atomic counters
for document numbers. See `prisma/schema.prisma`.

**AI bill → stock reconciliation** (`lib/server/stock.ts › receiveStock`)
1. `POST /api/bills/extract` sends the JPG/PNG/PDF to Gemini with a strict JSON schema plus your
   category and medicine lists, then pre-matches medicines, categories and the supplier.
2. The pharmacist edits the table; `POST /api/bills/preview` runs the *real* receive + reconcile in a
   transaction and **rolls it back**, showing exactly which PO lines will be fulfilled.
3. `POST /api/bills` ("Confirm & Add to Stock") commits atomically: creates or tops up batches, then matches
   ORDERED / PARTIALLY_RECEIVED PO lines (linked PO first, then the supplier's oldest), row-locked against
   double receipt. Lines become *Received / Added* with timestamps; fully received POs move to RECEIVED
   (the archived tab); partial backorders stay visible. Manual stock entry uses the same logic.

**FEFO POS** (`allocateFefo`) — takes stock from the earliest-expiring batches whose expiry is in the future,
splitting across batches when needed, with conditional decrements so concurrent counters can never oversell.
Expired batches are never sold.

**Returns** — customer returns validate quantity ≤ sold − already returned (row-locked), restock into the
*original batch* (or write off), and issue a prorated credit note. Supplier returns deduct batches and record
a debit note.

**Alerts** — expiry lead time and low-stock threshold have global defaults with per-medicine overrides;
the Alerts Center groups Expired / Expiring soon / Low stock / Out of stock and has one-click
"Add to Purchase Order" (adds to the supplier's draft PO).

**Net profit** = (sales − customer refunds) − (purchase cost of units sold − cost of restocked returns).
