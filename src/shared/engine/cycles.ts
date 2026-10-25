/** Budget cycles, payday to payday (docs/05 §3). */
import { addDays, addMonths, clampedDayIn, diffDays, maxDate, monthOf, type ISODate } from '../dates'
import type { Cycle } from '../schema'

export const EARLY_START_WINDOW_DAYS = 7
export const MAX_FIRST_CYCLE_BACKDATE_DAYS = 62

/** First payday occurrence strictly after `date`. */
export function nextPaydayAfter(date: ISODate, payday: number): ISODate {
  const sameMonth = clampedDayIn(monthOf(date), payday)
  return sameMonth > date ? sameMonth : clampedDayIn(addMonths(monthOf(date), 1), payday)
}

/** End date of a normal cycle starting on `start`. */
export function cycleEndFor(start: ISODate, payday: number): ISODate {
  return addDays(nextPaydayAfter(start, payday), -1)
}

export function sortCycles(cycles: readonly Cycle[]): Cycle[] {
  return [...cycles].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
}

export function findCycle(cycles: readonly Cycle[], date: ISODate): Cycle | undefined {
  return cycles.find((c) => c.startDate <= date && date <= c.endDate)
}

export function cycleLength(c: Cycle): number {
  return diffDays(c.startDate, c.endDate) + 1
}

/**
 * Append cycles until one contains `today`. New cycles copy the last cycle's allowance.
 * Returns the full sorted list and how many were added.
 */
export function ensureCycles(
  cycles: readonly Cycle[],
  payday: number,
  today: ISODate,
  newId: () => string
): { cycles: Cycle[]; added: number } {
  const out = sortCycles(cycles)
  let added = 0
  let last = out[out.length - 1]
  if (!last) return { cycles: out, added }
  while (today > last.endDate) {
    const start = addDays(last.endDate, 1)
    const next: Cycle = { id: newId(), startDate: start, endDate: cycleEndFor(start, payday), dailyAllowance: last.dailyAllowance }
    out.push(next)
    last = next
    added++
  }
  return { cycles: out, added }
}

export function currentCycle(cycles: readonly Cycle[], today: ISODate): Cycle | undefined {
  return findCycle(cycles, today)
}

export interface EarlyStartWindow {
  allowed: boolean
  /** Scheduled payday being replaced (current.endDate + 1). */
  scheduledPayday: ISODate
  earliest: ISODate
  latest: ISODate
}

export function earlyStartWindow(current: Cycle, today: ISODate): EarlyStartWindow {
  const scheduledPayday = addDays(current.endDate, 1)
  const windowStart = addDays(scheduledPayday, -EARLY_START_WINDOW_DAYS)
  const earliest = addDays(current.startDate, 1) > windowStart ? addDays(current.startDate, 1) : windowStart
  return { allowed: today >= windowStart && earliest <= today, scheduledPayday, earliest, latest: today }
}

/**
 * Salary arrived early: end the current cycle the day before `startDate` and start a new one
 * that absorbs the replaced payday (ends the day before the payday after it).
 */
export function startNextEarly(
  cycles: readonly Cycle[],
  payday: number,
  today: ISODate,
  startDate: ISODate,
  newId: () => string
): Cycle[] {
  const sorted = sortCycles(cycles)
  const current = findCycle(sorted, today)
  if (!current) throw new Error('No current cycle')
  const w = earlyStartWindow(current, today)
  if (!w.allowed) throw new Error(`You can start the next cycle early only within ${EARLY_START_WINDOW_DAYS} days of payday`)
  if (startDate < w.earliest || startDate > w.latest) throw new Error('Start date is outside the allowed range')
  const shortened: Cycle = { ...current, endDate: addDays(startDate, -1) }
  const next: Cycle = {
    id: newId(),
    startDate,
    endDate: cycleEndFor(w.scheduledPayday, payday),
    dailyAllowance: current.dailyAllowance
  }
  return sorted.map((c) => (c.id === current.id ? shortened : c)).concat(next)
}

/** Validates the first cycle start from setup (docs/05 §3). */
export function validateFirstCycleStart(start: ISODate, today: ISODate): string | null {
  if (start > today) return 'The first cycle cannot start in the future'
  if (diffDays(start, today) > MAX_FIRST_CYCLE_BACKDATE_DAYS) {
    return `The first cycle can start at most ${MAX_FIRST_CYCLE_BACKDATE_DAYS} days ago`
  }
  return null
}

// ---------- Extend tracking back (docs/05 §3) ----------

/** How far before today tracking may be extended (about 3 years). */
export const MAX_EXTEND_BACK_DAYS = 1096

/** Latest payday occurrence on or before `date` (clamped to the month's length). */
export function paydayOnOrBefore(date: ISODate, payday: number): ISODate {
  const sameMonth = clampedDayIn(monthOf(date), payday)
  return sameMonth <= date ? sameMonth : clampedDayIn(addMonths(monthOf(date), -1), payday)
}

/**
 * Only the NEW cycles needed to extend tracking back to `newStart`: sorted ascending and contiguous,
 * the first starts on `newStart` and the last ends the day before the current first cycle.
 * Built backwards from that first cycle, so a short cycle can appear right before it when it
 * started mid-month. Every new cycle gets `dailyAllowance`. Existing cycles are not touched.
 */
export function planExtendBack(
  cycles: readonly Cycle[],
  payday: number,
  newStart: ISODate,
  dailyAllowance: number,
  newId: () => string
): Cycle[] {
  const first = sortCycles(cycles)[0]
  if (!first) return []
  const out: Cycle[] = []
  let end = addDays(first.startDate, -1)
  while (end >= newStart) {
    const start = maxDate(newStart, paydayOnOrBefore(end, payday))
    out.push({ id: newId(), startDate: start, endDate: end, dailyAllowance })
    end = addDays(start, -1)
  }
  return out.reverse()
}

/** Full sorted cycle list after extending back: the planned new cycles followed by the existing ones. */
export function extendCyclesBack(
  cycles: readonly Cycle[],
  payday: number,
  newStart: ISODate,
  dailyAllowance: number,
  newId: () => string
): Cycle[] {
  return [...planExtendBack(cycles, payday, newStart, dailyAllowance, newId), ...sortCycles(cycles)]
}

/** Validates an extend-back request (docs/05 §3). Returns an error message or null. */
export function validateExtendBack(cycles: readonly Cycle[], newStart: ISODate, today: ISODate): string | null {
  const first = sortCycles(cycles)[0]
  if (!first) return 'There is no budget cycle yet'
  if (newStart >= first.startDate) return `The new start must be before your current first day (${first.startDate})`
  if (newStart > today) return 'The new start cannot be in the future'
  if (diffDays(newStart, today) > MAX_EXTEND_BACK_DAYS) {
    return `You can extend tracking back at most ${MAX_EXTEND_BACK_DAYS} days (about 3 years)`
  }
  return null
}
