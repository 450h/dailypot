/**
 * The side pot: one continuous derived timeline (docs/05 §5, ADR-0004).
 * Pure function of (state, today). Never store its output.
 */
import { dateRange, maxDate, type ISODate } from '../dates'
import type { AppState, ObligationPayment } from '../schema'
import { findCycle, sortCycles } from './cycles'
import { allInstances, compareInstances, dueDateOf, effectiveAmount, settlementMap, type Instance } from './obligations'

export interface PaymentSplit {
  paymentId: string
  key: string
  obligationId: string
  date: ISODate
  amount: number
  fromPot: number
  fromMain: number
  /** Pot money held back for earlier-due unpaid bills at the moment of payment. */
  reserved: number
  /** Pot balance just before this payment. */
  balanceBefore: number
}

export interface DayRow {
  date: ISODate
  cycleId: string | null
  allowance: number
  spent: number
  /** allowance − spent (projected for today). */
  delta: number
  closed: boolean
  payments: PaymentSplit[]
  /** Balance after this day's payments and (if closed) its delta. */
  balanceAfter: number
  unlogged: boolean
  confirmed: boolean
}

export interface PotResult {
  firstDate: ISODate | null
  days: DayRow[]
  /** Current balance: includes payments dated today, excludes today's open delta. */
  balance: number
  /** balance + today's projected delta. */
  projected: number
  splits: Map<string, PaymentSplit>
  cycleOpening: Map<string, number>
  cycleClosing: Map<string, number | null>
  /** All instances considered (dueDate ≥ first cycle start), in instance order. */
  instances: Instance[]
  settlements: Map<string, ObligationPayment>
}

export function emptyPot(): PotResult {
  return {
    firstDate: null,
    days: [],
    balance: 0,
    projected: 0,
    splits: new Map(),
    cycleOpening: new Map(),
    cycleClosing: new Map(),
    instances: [],
    settlements: new Map()
  }
}

export function computePot(state: AppState, today: ISODate): PotResult {
  const cycles = sortCycles(state.cycles)
  const first = cycles[0]
  if (!first || today < first.startDate) return emptyPot()
  const firstDate = first.startDate
  const lastCycle = cycles[cycles.length - 1]!

  const settlements = settlementMap(state.obligationPayments, today)
  // Horizon: current cycle end, extended to cover prepaid future instances.
  let horizon = maxDate(lastCycle.endDate, today)
  for (const p of settlements.values()) {
    const o = state.obligations.find((x) => x.id === p.obligationId)
    if (o) horizon = maxDate(horizon, dueDateOf(o, p.period))
  }
  const instances = allInstances(state.obligations, firstDate, horizon)

  // Paid settlements of known instances, in processing order (date, then instance order).
  const paid = instances
    .map((inst) => ({ inst, s: settlements.get(inst.key) }))
    .filter((x): x is { inst: Instance; s: ObligationPayment } => x.s?.status === 'paid')
    .sort((a, b) => (a.s.date !== b.s.date ? (a.s.date < b.s.date ? -1 : 1) : compareInstances(a.inst, b.inst)))

  const paidSoFar = new Set<string>()
  const splits = new Map<string, PaymentSplit>()
  let balance = 0

  const pay = (inst: Instance, s: ObligationPayment, potAllowed: boolean): PaymentSplit => {
    let reserved = 0
    for (const other of instances) {
      if (compareInstances(other, inst) >= 0) break
      const os = settlements.get(other.key)
      if (os?.status === 'skipped' || paidSoFar.has(other.key)) continue
      reserved += effectiveAmount(other, os)
    }
    const available = potAllowed ? Math.max(0, balance - reserved) : 0
    const fromPot = Math.min(available, s.amount)
    const split: PaymentSplit = {
      paymentId: s.id,
      key: inst.key,
      obligationId: inst.obligationId,
      date: s.date,
      amount: s.amount,
      fromPot,
      fromMain: s.amount - fromPot,
      reserved,
      balanceBefore: balance
    }
    balance -= fromPot
    paidSoFar.add(inst.key)
    splits.set(s.id, split)
    return split
  }

  // Payments dated before the timeline (legacy/imported) never touch the pot.
  let idx = 0
  while (idx < paid.length && paid[idx]!.s.date < firstDate) {
    pay(paid[idx]!.inst, paid[idx]!.s, false)
    idx++
  }

  const dailyByDate = new Map<ISODate, number>()
  for (const t of state.transactions) {
    if (t.kind !== 'daily' || t.date < firstDate || t.date > today) continue
    dailyByDate.set(t.date, (dailyByDate.get(t.date) ?? 0) + t.amount)
  }
  const confirmed = new Set(state.confirmedDays.map((c) => c.date))

  const days: DayRow[] = []
  const cycleOpening = new Map<string, number>()
  const cycleClosing = new Map<string, number | null>()
  let projected = 0

  for (const date of dateRange(firstDate, today)) {
    const cycle = findCycle(cycles, date)
    if (cycle && cycle.startDate === date) cycleOpening.set(cycle.id, balance)

    const payments: PaymentSplit[] = []
    while (idx < paid.length && paid[idx]!.s.date === date) {
      payments.push(pay(paid[idx]!.inst, paid[idx]!.s, true))
      idx++
    }

    const allowance = cycle?.dailyAllowance ?? 0
    const spent = dailyByDate.get(date) ?? 0
    const delta = allowance - spent
    const closed = date < today
    if (closed) balance += delta
    else projected = balance + delta

    days.push({
      date,
      cycleId: cycle?.id ?? null,
      allowance,
      spent,
      delta,
      closed,
      payments,
      balanceAfter: closed ? balance : balance + delta,
      unlogged: closed && spent === 0 && !confirmed.has(date),
      confirmed: confirmed.has(date)
    })

    if (cycle && cycle.endDate === date) cycleClosing.set(cycle.id, closed ? balance : null)
  }
  for (const c of cycles) if (!cycleClosing.has(c.id)) cycleClosing.set(c.id, null)

  return { firstDate, days, balance, projected, splits, cycleOpening, cycleClosing, instances, settlements }
}
