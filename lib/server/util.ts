import { Prisma } from '@prisma/client'
import type { Tx } from './db'

export const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v)
export const money = (v: number) => Math.round(v * 100) / 100

export const PHARMACY_TZ = process.env.PHARMACY_TZ || 'Asia/Karachi'

/** Today's date in the pharmacy timezone as a UTC-midnight Date, matching how @db.Date columns are stored. */
export function todayDateOnly() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: PHARMACY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return parseDateOnly(s)
}
export function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}
export function daysUntil(date: Date) {
  return Math.round((date.getTime() - todayDateOnly().getTime()) / 86_400_000)
}
/** Parse 'YYYY-MM-DD' (or ISO) into a UTC-midnight date for @db.Date columns. */
export function parseDateOnly(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) throw new Error(`Invalid date: ${s}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}

/** Atomically allocate the next document number for a sequence. */
export async function nextNumber(tx: Tx, key: string, format: (n: number) => string) {
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } })
  return format(c.value)
}

// Settings change rarely: cache for 30s per server instance (invalidated on update).
let settingsCache: { value: Awaited<ReturnType<Tx['setting']['findUnique']>>; at: number } | null = null
export function invalidateSettings() { settingsCache = null }
export async function getSettings(tx: Tx) {
  if (settingsCache?.value && Date.now() - settingsCache.at < 30_000) return settingsCache.value
  const value = (await tx.setting.findUnique({ where: { id: 1 } })) ?? (await tx.setting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }))
  settingsCache = { value, at: Date.now() }
  return value
}

/** Minutes the pharmacy timezone is ahead of UTC at a given instant. */
export function tzOffsetMinutes(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: PHARMACY_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}
/** The UTC instant at which the given local calendar day (YYYY-MM-DD) starts in the pharmacy timezone. */
export function localDayStart(dateStr: string) {
  const d = parseDateOnly(dateStr)
  return new Date(d.getTime() - tzOffsetMinutes(d) * 60_000)
}
export function localDateString(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PHARMACY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}
