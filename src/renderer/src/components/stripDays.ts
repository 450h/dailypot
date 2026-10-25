/**
 * DayRow → Day Strip cell (docs/10 §5.2), shared by the dashboard ribbon and Pot history so both pages agree on
 * every state and label. No React here, so the node vitest config can test it.
 * `confirmed` means "confirmed as spent nothing" (docs/05 §5): a confirmed day that later received a daily entry
 * shows as fed/drew, never as the no-spend dot.
 */
import { dateRange, formatDate, weekdayShort, type ISODate } from '@shared/dates'
import type { DayRow } from '@shared/engine'
import { formatAmount } from '@shared/money'
import type { Cycle } from '@shared/schema'
import type { StripDay, StripState } from './viz'

const when = (date: ISODate): string => `${weekdayShort(date)} ${formatDate(date)}`

export function stripState(d: DayRow, today: ISODate): StripState {
  if (d.date > today) return 'future'
  if (!d.closed) return 'today'
  if (d.unlogged) return 'unlogged'
  if (d.confirmed && d.spent === 0) return 'confirmed'
  return d.delta < 0 ? 'drew' : 'fed'
}

export function stripLabel(d: DayRow, state: StripState): string {
  switch (state) {
    case 'future':
      return `${when(d.date)}, upcoming`
    case 'today':
      return `${when(d.date)}, today, spent ${formatAmount(d.spent)} so far`
    case 'unlogged':
      return `${when(d.date)}, unlogged, added your full per-day ${formatAmount(d.allowance)} to the pot`
    case 'confirmed':
      return `${when(d.date)}, spent nothing, ${formatAmount(d.delta)} to the pot`
    default:
      return `${when(d.date)}, spent ${formatAmount(d.spent)}, ${formatAmount(Math.abs(d.delta))} ${d.delta >= 0 ? 'to the pot' : 'from the pot'}`
  }
}

/** One cell per day of `cycle`; days without a row (after today) are `future`. */
export function stripDaysFor(rows: readonly DayRow[], cycle: Pick<Cycle, 'startDate' | 'endDate'>, today: ISODate): StripDay[] {
  const byDate = new Map(rows.map((d) => [d.date, d]))
  return dateRange(cycle.startDate, cycle.endDate).map((date) => {
    const d = byDate.get(date)
    if (!d || date > today) return { date, state: 'future', label: `${when(date)}, upcoming` }
    const state = stripState(d, today)
    return { date, state, label: stripLabel(d, state), spent: d.spent, delta: d.delta }
  })
}
