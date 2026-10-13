/** Report figures, goals and investments (docs/05 §6, §7). */
import { diffDays, maxDate, minDate, parts, type ISODate } from '../dates'
import { ceilDiv } from '../money'
import type { AppState, Cycle, Goal, Holding } from '../schema'
import type { PotResult } from './pot'

const inRange = (d: ISODate, from: ISODate, to: ISODate): boolean => d >= from && d <= to

export interface CycleSummary {
  cycle: Cycle
  /** Last day counted (cycle end, or today for the open cycle). */
  through: ISODate
  openingPot: number | null
  closingPot: number | null
  currentPot: number | null
  totalAllowance: number
  dailySpend: number
  nonDailySpend: number
  income: number
  billsPaid: number
  billsFromPot: number
  billsFromMain: number
  shortfallCount: number
  goalNet: number
  investmentNet: number
  cashFlow: number
}

export function cycleSummary(state: AppState, pot: PotResult, cycle: Cycle, today: ISODate): CycleSummary {
  const through = minDate(cycle.endDate, maxDate(today, cycle.startDate))
  const from = cycle.startDate
  const to = cycle.endDate
  let dailySpend = 0
  let nonDailySpend = 0
  let income = 0
  for (const t of state.transactions) {
    if (!inRange(t.date, from, to) || t.date > today) continue
    if (t.kind === 'daily') dailySpend += t.amount
    else if (t.kind === 'nonDaily') nonDailySpend += t.amount
    else income += t.amount
  }
  let billsPaid = 0
  let billsFromPot = 0
  let billsFromMain = 0
  let shortfallCount = 0
  for (const s of pot.splits.values()) {
    if (!inRange(s.date, from, to)) continue
    billsPaid += s.amount
    billsFromPot += s.fromPot
    billsFromMain += s.fromMain
    if (s.fromMain > 0) shortfallCount++
  }
  const goalNet = state.goalContributions
    .filter((g) => inRange(g.date, from, to) && g.date <= today)
    .reduce((sum, g) => sum + g.amount, 0)
  const investmentNet = state.holdingTransactions
    .filter((h) => inRange(h.date, from, to) && h.date <= today)
    .reduce((sum, h) => sum + (h.kind === 'buy' ? h.amount : -h.amount), 0)

  const countedFrom = pot.firstDate ? maxDate(from, pot.firstDate) : from
  const days = Math.max(0, diffDays(countedFrom, to) + 1)
  const isOpen = today >= from && today <= to
  return {
    cycle,
    through,
    openingPot: pot.cycleOpening.get(cycle.id) ?? null,
    closingPot: pot.cycleClosing.get(cycle.id) ?? null,
    currentPot: isOpen ? pot.balance : null,
    totalAllowance: cycle.dailyAllowance * days,
    dailySpend,
    nonDailySpend,
    income,
    billsPaid,
    billsFromPot,
    billsFromMain,
    shortfallCount,
    goalNet,
    investmentNet,
    cashFlow: income - (dailySpend + nonDailySpend + billsPaid + goalNet + investmentNet)
  }
}

export interface CategoryTotal {
  categoryId: string
  daily: number
  nonDaily: number
  total: number
}

export function spendingByCategory(state: AppState, from: ISODate, to: ISODate): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const t of state.transactions) {
    if (t.kind === 'income' || !inRange(t.date, from, to)) continue
    const row = map.get(t.categoryId) ?? { categoryId: t.categoryId, daily: 0, nonDaily: 0, total: 0 }
    if (t.kind === 'daily') row.daily += t.amount
    else row.nonDaily += t.amount
    row.total += t.amount
    map.set(t.categoryId, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

// ---------- Goals ----------

/** Calendar months from `today` to `target`, rounded up, minimum 1 (docs/05 §7). */
export function monthsLeft(today: ISODate, target: ISODate): number {
  const a = parts(today)
  const b = parts(target)
  const months = (b.y - a.y) * 12 + (b.m - a.m) + (b.d > a.d ? 1 : 0)
  return Math.max(1, months)
}

export interface GoalFigures {
  goal: Goal
  saved: number
  remaining: number
  progress: number
  neededPerMonth: number | null
  targetPassed: boolean
}

export function goalFigures(state: AppState, goal: Goal, today: ISODate): GoalFigures {
  const saved = state.goalContributions.filter((c) => c.goalId === goal.id).reduce((s, c) => s + c.amount, 0)
  const remaining = Math.max(0, goal.targetAmount - saved)
  const progress = Math.min(1, Math.max(0, saved / goal.targetAmount))
  const targetPassed = !!goal.targetDate && goal.targetDate < today
  const neededPerMonth =
    goal.targetDate && !targetPassed ? ceilDiv(remaining, monthsLeft(today, goal.targetDate)) : null
  return { goal, saved, remaining, progress, neededPerMonth, targetPassed }
}

// ---------- Investments ----------

export type ValueBasis = 'valuation' | 'estimated' | 'noValuation' | 'closed'

export interface HoldingFigures {
  holding: Holding
  netInvested: number
  value: number
  basis: ValueBasis
  valuationDate: ISODate | null
  gain: number
  gainPct: number | null
}

export function holdingFigures(state: AppState, holding: Holding): HoldingFigures {
  const txs = state.holdingTransactions.filter((t) => t.holdingId === holding.id)
  const flow = (t: { kind: 'buy' | 'sell'; amount: number }): number => (t.kind === 'buy' ? t.amount : -t.amount)
  const netInvested = txs.reduce((s, t) => s + flow(t), 0)
  const latest = state.holdingValuations
    .filter((v) => v.holdingId === holding.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0]

  let value: number
  let basis: ValueBasis
  if (!latest) {
    value = netInvested
    basis = 'noValuation'
  } else {
    const later = txs.filter((t) => t.date > latest.date)
    value = latest.value + later.reduce((s, t) => s + flow(t), 0)
    basis = later.length > 0 ? 'estimated' : 'valuation'
    if (value <= 0 && !later.some((t) => t.kind === 'buy')) basis = 'closed'
  }
  value = Math.max(0, value)
  const gain = value - netInvested
  return {
    holding,
    netInvested,
    value,
    basis,
    valuationDate: latest?.date ?? null,
    gain,
    gainPct: netInvested > 0 ? gain / netInvested : null
  }
}

export interface PortfolioTotals {
  netInvested: number
  value: number
  gain: number
  gainPct: number | null
}

export function portfolioTotals(rows: readonly HoldingFigures[]): PortfolioTotals {
  const active = rows.filter((r) => !r.holding.archived)
  const netInvested = active.reduce((s, r) => s + r.netInvested, 0)
  const value = active.reduce((s, r) => s + r.value, 0)
  const gain = value - netInvested
  return { netInvested, value, gain, gainPct: netInvested > 0 ? gain / netInvested : null }
}
