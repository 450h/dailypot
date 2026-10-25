/**
 * Main balance & net worth (docs/05 §10, ADR-0007). Derived, never stored.
 * The balance is an optional anchor ("at the start of `date` I had `amount`") plus every cash flow
 * since; without an anchor it is the change since the first cycle started.
 */
import { addDays, dateRange, maxDate, minDate, type ISODate } from '../dates'
import type { AppState, BalanceAnchor } from '../schema'
import { sortCycles } from './cycles'
import { holdingFigures, portfolioTotals } from './reports'

/** Sums of the flows inside the window (minor units). income/daily/nonDaily/bills are sums of positive amounts. */
export interface BalanceFlows {
  income: number
  daily: number
  nonDaily: number
  /** Paid bill settlements, by payment date. */
  bills: number
  /** Σ goalContributions.amount, signed: + cash moved out to a goal, − withdrawn back. */
  goals: number
  /** Σ (buy ? +amount : −amount): net cash moved out to holdings. */
  investments: number
}

export interface BalanceResult {
  anchored: boolean
  /** First day of the window (anchor date, else first cycle start), or null when there is neither. */
  since: ISODate | null
  balance: number
  flows: BalanceFlows
}

const emptyFlows = (): BalanceFlows => ({ income: 0, daily: 0, nonDaily: 0, bills: 0, goals: 0, investments: 0 })

/** Signed net cash flow: what the flows add to (or take from) the main balance. */
export function netFlow(f: BalanceFlows): number {
  return f.income - f.daily - f.nonDaily - f.bills - f.goals - f.investments
}

function windowStart(state: AppState): ISODate | null {
  return state.settings.balanceAnchor?.date ?? sortCycles(state.cycles)[0]?.startDate ?? null
}

/** Flows dated within [from, to] inclusive: totals per kind, and the signed net per day. */
function collectFlows(state: AppState, from: ISODate, to: ISODate): { flows: BalanceFlows; netByDate: Map<ISODate, number> } {
  const flows = emptyFlows()
  const netByDate = new Map<ISODate, number>()
  const add = (date: ISODate, signed: number): void => {
    netByDate.set(date, (netByDate.get(date) ?? 0) + signed)
  }
  const inWindow = (d: ISODate): boolean => d >= from && d <= to
  for (const t of state.transactions) {
    if (!inWindow(t.date)) continue
    if (t.kind === 'income') {
      flows.income += t.amount
      add(t.date, t.amount)
    } else if (t.kind === 'daily') {
      flows.daily += t.amount
      add(t.date, -t.amount)
    } else {
      flows.nonDaily += t.amount
      add(t.date, -t.amount)
    }
  }
  for (const p of state.obligationPayments) {
    if (p.status !== 'paid' || !inWindow(p.date)) continue
    flows.bills += p.amount
    add(p.date, -p.amount)
  }
  for (const c of state.goalContributions) {
    if (!inWindow(c.date)) continue
    flows.goals += c.amount
    add(c.date, -c.amount)
  }
  for (const h of state.holdingTransactions) {
    if (!inWindow(h.date)) continue
    const signed = h.kind === 'buy' ? h.amount : -h.amount
    flows.investments += signed
    add(h.date, -signed)
  }
  return { flows, netByDate }
}

/**
 * Main balance today: (anchor amount or 0) + income − daily − nonDaily − bills − goals − investments
 * over the window [since, today]. Items dated after today are ignored (clock safety).
 */
export function computeBalance(state: AppState, today: ISODate): BalanceResult {
  const anchor = state.settings.balanceAnchor
  const since = windowStart(state)
  if (since === null) return { anchored: false, since: null, balance: 0, flows: emptyFlows() }
  const { flows } = collectFlows(state, since, today)
  return { anchored: anchor !== undefined, since, balance: (anchor?.amount ?? 0) + netFlow(flows), flows }
}

/**
 * End-of-day balance for each date from max(since, today − (days − 1)) to today, inclusive.
 * Empty when there is no window. The last point equals computeBalance(state, today).balance, also
 * when the anchor is dated after today (clock rolled back): the series is then the single point today.
 */
export function balanceSeries(state: AppState, today: ISODate, days: number): Array<{ date: ISODate; balance: number }> {
  const since = windowStart(state)
  if (since === null || days <= 0) return []
  const { netByDate } = collectFlows(state, since, today)
  const start = minDate(since, today)
  const from = maxDate(start, addDays(today, -(days - 1)))
  const out: Array<{ date: ISODate; balance: number }> = []
  let balance = state.settings.balanceAnchor?.amount ?? 0
  for (const date of dateRange(start, today)) {
    balance += netByDate.get(date) ?? 0
    if (date >= from) out.push({ date, balance })
  }
  return out
}

/**
 * The anchor to store when the user says "my balance right now is X": dated today, with today's
 * flows backed out, so that computeBalance(...).balance === X afterwards.
 */
export function anchorForBalanceNow(state: AppState, today: ISODate, balanceNow: number): BalanceAnchor {
  const { flows } = collectFlows(state, today, today)
  return { date: today, amount: balanceNow - netFlow(flows) }
}

/**
 * Net worth = cash + savings + investments. Archiving a goal or holding means it is closed: its money
 * stops counting while its contributions and buys remain cash that left the main balance, so net worth
 * drops by the amount it held (docs/05 §10).
 */
export interface NetWorth {
  /** The main balance (computeBalance). */
  cash: number
  /** Σ contributions of non-archived goals, dated ≤ today. */
  savings: number
  /** Portfolio value of non-archived holdings from records dated ≤ today (docs/05 §7). */
  investments: number
  total: number
  anchored: boolean
}

export function netWorth(state: AppState, today: ISODate): NetWorth {
  const cash = computeBalance(state, today)
  const activeGoals = new Set(state.goals.filter((g) => !g.archived).map((g) => g.id))
  const savings = state.goalContributions
    .filter((c) => activeGoals.has(c.goalId) && c.date <= today)
    .reduce((sum, c) => sum + c.amount, 0)
  const investments = portfolioTotals(state.holdings.filter((h) => !h.archived).map((h) => holdingFigures(state, h, today))).value
  return { cash: cash.balance, savings, investments, total: cash.balance + savings + investments, anchored: cash.anchored }
}
