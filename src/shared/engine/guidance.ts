/** Earmarks, safe-to-spend and the dashboard bill list (docs/05 §5, §6). Display only. */
import { diffDays, type ISODate } from '../dates'
import { ceilDiv } from '../money'
import type { Cycle, ObligationPayment } from '../schema'
import { instanceStatus, type Instance, type InstanceStatus } from './obligations'
import type { DayRow, PaymentSplit, PotResult } from './pot'

/** Unsettled instances due on or before the current cycle's end, in instance order. */
export function openInstances(pot: PotResult, current: Cycle): Instance[] {
  return pot.instances.filter((i) => !pot.settlements.has(i.key) && i.dueDate <= current.endDate)
}

export function earmarks(pot: PotResult, current: Cycle): Map<string, number> {
  const funded = new Map<string, number>()
  let remaining = Math.max(pot.balance, 0)
  for (const inst of openInstances(pot, current)) {
    const f = Math.min(remaining, inst.plannedAmount)
    funded.set(inst.key, f)
    remaining -= f
  }
  return funded
}

export interface SafeToSpend {
  allowance: number
  /** Per-day spend (today included) that still lets the pot cover upcoming bills. */
  safeDaily: number
  /** Due-today/overdue amount that the pot cannot cover. */
  fromMainNow: number
  /** If safeDaily < 0: shortfall even when spending nothing. */
  unavoidableShortfall: number
  allFunded: boolean
}

export function safeToSpend(pot: PotResult, current: Cycle, today: ISODate): SafeToSpend {
  const A = current.dailyAllowance
  const balance = pot.balance
  let running = 0
  let fromMainNow = 0
  let maxNeed = 0
  let unavoidable = 0
  for (const inst of openInstances(pot, current)) {
    running += inst.plannedAmount
    const n = diffDays(today, inst.dueDate)
    const gap = running - balance
    if (n <= 0) {
      fromMainNow = Math.max(fromMainNow, gap, 0)
    } else {
      maxNeed = Math.max(maxNeed, ceilDiv(Math.max(0, gap), n))
      unavoidable = Math.max(unavoidable, gap - A * n)
    }
  }
  const safeDaily = A - maxNeed
  return {
    allowance: A,
    safeDaily,
    fromMainNow,
    unavoidableShortfall: safeDaily < 0 ? Math.max(0, unavoidable) : 0,
    allFunded: maxNeed === 0 && fromMainNow === 0
  }
}

export interface BillRow {
  instance: Instance
  status: InstanceStatus
  settlement?: ObligationPayment
  split?: PaymentSplit
  /** Amount earmarked from the pot (unsettled only). */
  funded: number
  /** Effective amount: payment amount, 0 when skipped, otherwise planned. */
  amount: number
}

/** This cycle's instances + earlier unsettled ones + prepaid future ones paid this cycle. */
export function dashboardBills(pot: PotResult, current: Cycle, today: ISODate): BillRow[] {
  const funded = earmarks(pot, current)
  const rows: BillRow[] = []
  for (const inst of pot.instances) {
    const s = pot.settlements.get(inst.key)
    const inCycle = inst.dueDate >= current.startDate && inst.dueDate <= current.endDate
    const overdueEarlier = inst.dueDate < current.startDate && !s
    const prepaidThisCycle =
      inst.dueDate > current.endDate && s?.status === 'paid' && s.date >= current.startDate && s.date <= current.endDate
    if (!inCycle && !overdueEarlier && !prepaidThisCycle) continue
    rows.push({
      instance: inst,
      status: instanceStatus(inst, s, today),
      ...(s ? { settlement: s } : {}),
      ...(s ? { split: pot.splits.get(s.id) } : {}),
      funded: funded.get(inst.key) ?? 0,
      amount: s ? (s.status === 'paid' ? s.amount : 0) : inst.plannedAmount
    })
  }
  return rows
}

export interface BillTotals {
  /** Effective amount of every open (unpaid, unskipped) row. */
  dueTotal: number
  /** Pot money earmarked for those rows (nearest due first, `earmarks`). */
  fundedTotal: number
  /** What the main balance would cover if nothing changed: `max(0, dueTotal − fundedTotal)`. */
  fromMainEstimate: number
}

/** Footer of the bills ledger (docs/09 §6.8) over `dashboardBills` rows; paid and skipped rows are settled and excluded. */
export function dashboardBillTotals(rows: ReadonlyArray<BillRow>): BillTotals {
  let dueTotal = 0
  let fundedTotal = 0
  for (const r of rows) {
    if (r.status === 'paid' || r.status === 'skipped') continue
    dueTotal += r.amount
    fundedTotal += r.funded
  }
  return { dueTotal, fundedTotal, fromMainEstimate: Math.max(0, dueTotal - fundedTotal) }
}

/** Closed days with no daily spending and no "spent nothing" confirmation, NEWEST first, optionally within [from, to]. */
export function unloggedDays(pot: PotResult, from?: ISODate, to?: ISODate): DayRow[] {
  return pot.days
    .filter((d) => d.closed && d.unlogged && (from === undefined || d.date >= from) && (to === undefined || d.date <= to))
    .reverse()
}
