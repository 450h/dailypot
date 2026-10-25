/** Obligation instances: one per calendar month (docs/05 §4). */
import { addMonths, clampedDayIn, monthOf, type ISODate, type MonthKey } from '../dates'
import type { Obligation, ObligationPayment } from '../schema'

export interface Instance {
  key: string
  obligationId: string
  name: string
  period: MonthKey
  dueDate: ISODate
  plannedAmount: number
}

export type InstanceStatus = 'paid' | 'skipped' | 'overdue' | 'dueToday' | 'upcoming'

export const instanceKey = (obligationId: string, period: MonthKey): string => `${obligationId}:${period}`

/** Instance order used everywhere: dueDate, then name, then obligation id. */
export function compareInstances(a: Instance, b: Instance): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.obligationId < b.obligationId ? -1 : a.obligationId > b.obligationId ? 1 : 0
}

/** Instances of one obligation with `from ≤ dueDate ≤ to`. */
export function instancesOf(o: Obligation, from: ISODate, to: ISODate): Instance[] {
  const out: Instance[] = []
  if (to < from) return out
  let period = o.startMonth > monthOf(from) ? o.startMonth : monthOf(from)
  const lastPeriod = o.endMonth && o.endMonth < monthOf(to) ? o.endMonth : monthOf(to)
  for (; period <= lastPeriod; period = addMonths(period, 1)) {
    const dueDate = clampedDayIn(period, o.dueDay)
    if (dueDate < from || dueDate > to) continue
    out.push({ key: instanceKey(o.id, period), obligationId: o.id, name: o.name, period, dueDate, plannedAmount: o.amount })
  }
  return out
}

export function allInstances(obligations: readonly Obligation[], from: ISODate, to: ISODate): Instance[] {
  return obligations.flatMap((o) => instancesOf(o, from, to)).sort(compareInstances)
}

/** The due date of an obligation in a period. */
export function dueDateOf(o: Obligation, period: MonthKey): ISODate {
  return clampedDayIn(period, o.dueDay)
}

/**
 * Default start month for a new obligation: the first month whose due date is ≥ `onOrAfter`
 * (today, or the first cycle start in the setup wizard).
 */
export function defaultStartMonth(dueDay: number, onOrAfter: ISODate): MonthKey {
  const m = monthOf(onOrAfter)
  return clampedDayIn(m, dueDay) >= onOrAfter ? m : addMonths(m, 1)
}

/** Settlements that the engine honours (dated ≤ today), keyed by instance key. */
export function settlementMap(payments: readonly ObligationPayment[], today: ISODate): Map<string, ObligationPayment> {
  const map = new Map<string, ObligationPayment>()
  for (const p of payments) if (p.date <= today) map.set(instanceKey(p.obligationId, p.period), p)
  return map
}

/**
 * The bill months "Extend tracking back" marks skipped (docs/05 §3): instances due in `[from, to]` and before
 * `today` that have no settlement row at all. Deliberately not `settlementMap`: a row dated after today (clock
 * rolled back) still occupies its month, because a month may be settled at most once (integrityError). Main and
 * the dialog preview both take the list from here; there is no second definition.
 */
export function pastBillsToSkip(obligations: readonly Obligation[], payments: readonly ObligationPayment[], from: ISODate, to: ISODate, today: ISODate): Instance[] {
  const settled = new Set(payments.map((p) => instanceKey(p.obligationId, p.period)))
  return allInstances(obligations, from, to).filter((i) => i.dueDate < today && !settled.has(i.key))
}

/** Paid → payment amount; skipped → 0; unsettled → obligation's current amount. */
export function effectiveAmount(inst: Instance, settlement: ObligationPayment | undefined): number {
  if (!settlement) return inst.plannedAmount
  return settlement.status === 'paid' ? settlement.amount : 0
}

export function instanceStatus(inst: Instance, settlement: ObligationPayment | undefined, today: ISODate): InstanceStatus {
  if (settlement) return settlement.status
  if (inst.dueDate < today) return 'overdue'
  if (inst.dueDate === today) return 'dueToday'
  return 'upcoming'
}
