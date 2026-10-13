/**
 * Money is integer minor units (ADR-0003). Parsing and formatting are the only
 * conversion points between user text and stored integers.
 */

/** Two-decimal currencies supported in v1 (docs/05 §1). */
export const CURRENCIES = ['SAR', 'AED', 'QAR', 'USD', 'EUR', 'GBP', 'EGP', 'INR', 'PKR', 'TRY', 'CAD', 'AUD'] as const
export type Currency = (typeof CURRENCIES)[number]

export const MAX_AMOUNT = 1_000_000_000 // 10,000,000.00

const MONEY_RE = /^(\d{1,8})(?:\.(\d{1,2}))?$/

/** Parse "70", "70.5", "70.50" into minor units. Commas are rejected so "1,50" can't mean 1.50. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/[\s_]/g, '')
  const m = MONEY_RE.exec(s)
  if (!m) return null
  const whole = Number(m[1])
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0
  const minor = whole * 100 + frac
  return minor <= MAX_AMOUNT ? minor : null
}

/** "1,234.50" — no currency code. Negative numbers get a leading minus. */
export function formatAmount(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole.toLocaleString('en-US')}.${frac}`
}

export function formatMoney(minor: number, currency: string): string {
  return `${formatAmount(minor)} ${currency}`
}

/** Plain decimal for inputs and CSV: "70.5" → "70.50", no thousands separators. */
export function toDecimalString(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Ceiling division for non-negative numerators; guidance is never optimistic (ADR-0003). */
export function ceilDiv(a: number, b: number): number {
  if (b <= 0) throw new Error('ceilDiv: divisor must be positive')
  return Math.ceil(a / b)
}
