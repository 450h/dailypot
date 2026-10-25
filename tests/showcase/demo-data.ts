/**
 * Realistic, deterministic demo data for README screenshots (never shipped in the app).
 * Three payday cycles ending today, with bills, goals and investments.
 */
import { randomUUID } from 'node:crypto'
import { addDays, addMonths, clampedDayIn, dateRange, monthOf, todayLocal } from '../../src/shared/dates'
import { cycleEndFor, ensureCycles, instancesOf, nextPaydayAfter } from '../../src/shared/engine'
import { emptyState, type AppState, type Obligation } from '../../src/shared/schema'

const PAYDAY = 27
const ALLOWANCE = 7000

/** Small seeded PRNG so screenshots look the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function demoState(today = todayLocal()): AppState {
  const rand = rng(42)
  const id = (): string => randomUUID()
  const s = emptyState(id)
  s.settings = { ...s.settings, currency: 'SAR', payday: PAYDAY, setupComplete: true, lastExportAt: `${addDays(today, -6)}T18:00:00.000Z` }
  const cat = (name: string): string => s.categories.find((c) => c.name === name)!.id

  // Cycles: start two paydays back so there are two closed cycles + the current one.
  let start = today
  for (let i = 0; i < 3; i++) start = addDays(start, -28)
  start = addDays(nextPaydayAfter(start, PAYDAY), 0)
  const first = { id: id(), startDate: start, endDate: cycleEndFor(start, PAYDAY), dailyAllowance: ALLOWANCE }
  s.cycles = ensureCycles([first], PAYDAY, today, id).cycles
  // Main balance anchor (docs/05 §10): the balance at the start of the first tracked day, so the masthead shows a live balance.
  s.settings.balanceAnchor = { date: start, amount: 850_000 }
  const ts = (d: string): string => `${d}T12:00:00.000Z`

  // Daily spending on every closed day (a few overspends, a couple of zero days).
  const daily: Array<[string, number, number, string?]> = [
    ['Coffee', 900, 1800, 'Flat white'],
    ['Food & dining', 2200, 4500, 'Lunch'],
    ['Groceries', 3000, 9000, 'Weekly shop'],
    ['Transport & fuel', 4000, 8000, 'Fuel'],
    ['Entertainment', 2500, 6000, 'Cinema'],
    ['Coffee', 1200, 1600, 'قهوة مختصة']
  ]
  for (const date of dateRange(start, addDays(today, -1))) {
    const r = rand()
    if (r < 0.06) {
      s.confirmedDays.push({ id: id(), date })
      continue
    }
    const count = r < 0.5 ? 1 : r < 0.85 ? 2 : 3
    for (let i = 0; i < count; i++) {
      const [name, lo, hi, note] = daily[Math.floor(rand() * daily.length)]!
      const amount = Math.round((lo + rand() * (hi - lo)) / 50) * 50
      s.transactions.push({ id: id(), date, amount, kind: 'daily', categoryId: cat(name), ...(note ? { note } : {}), createdAt: ts(date) })
    }
  }
  // Today so far.
  s.transactions.push({ id: id(), date: today, amount: 1400, kind: 'daily', categoryId: cat('Coffee'), note: 'Morning coffee', createdAt: ts(today) })
  s.transactions.push({ id: id(), date: today, amount: 2100, kind: 'daily', categoryId: cat('Food & dining'), note: 'Shawarma', createdAt: ts(today) })

  // Salary on each cycle start + one-off expenses.
  for (const c of s.cycles) s.transactions.push({ id: id(), date: c.startDate, amount: 1_200_000, kind: 'income', categoryId: cat('Salary'), note: 'Salary', createdAt: ts(c.startDate) })
  const mid = s.cycles[1]!.startDate
  s.transactions.push({ id: id(), date: addDays(mid, 6), amount: 45_000, kind: 'nonDaily', categoryId: cat('Transport & fuel'), note: 'Car service', createdAt: ts(mid) })
  s.transactions.push({ id: id(), date: addDays(start, 12), amount: 30_000, kind: 'nonDaily', categoryId: cat('Shopping'), note: 'Birthday gift', createdAt: ts(start) })

  // Bills.
  const bills: Obligation[] = [
    { id: id(), name: 'Phone', amount: 8000, dueDay: 5, startMonth: monthOf(start), categoryId: cat('Bills & subscriptions') },
    { id: id(), name: 'Gym', amount: 15000, dueDay: 15, startMonth: monthOf(start), categoryId: cat('Health') },
    { id: id(), name: 'Internet', amount: 19900, dueDay: 20, startMonth: monthOf(start), categoryId: cat('Bills & subscriptions') },
    { id: id(), name: 'Netflix', amount: 4500, dueDay: 28, startMonth: monthOf(start), categoryId: cat('Entertainment') }
  ]
  s.obligations = bills
  const end = s.cycles.at(-1)!.endDate
  for (const o of bills) {
    for (const inst of instancesOf(o, start, end)) {
      if (inst.dueDate >= today) continue
      if (o.name === 'Netflix' && inst.dueDate === clampedDayIn(monthOf(addMonths(monthOf(today), -1)), 28)) {
        s.obligationPayments.push({ id: id(), obligationId: o.id, period: inst.period, status: 'skipped', date: inst.dueDate, amount: 0, note: 'Free month', createdAt: ts(inst.dueDate) })
        continue
      }
      s.obligationPayments.push({ id: id(), obligationId: o.id, period: inst.period, status: 'paid', date: inst.dueDate, amount: inst.plannedAmount, createdAt: ts(inst.dueDate) })
    }
  }

  // Savings goals.
  const car = { id: id(), name: 'Car', targetAmount: 2_000_000, targetDate: addDays(today, 240), archived: false, createdAt: ts(start) }
  const emergency = { id: id(), name: 'Emergency fund', targetAmount: 1_500_000, archived: false, createdAt: ts(start) }
  const umrah = { id: id(), name: 'Umrah trip', targetAmount: 600_000, targetDate: addDays(today, 120), archived: false, createdAt: ts(start) }
  s.goals = [car, emergency, umrah]
  for (const c of s.cycles) {
    s.goalContributions.push({ id: id(), goalId: car.id, date: addDays(c.startDate, 1), amount: 150_000 })
    s.goalContributions.push({ id: id(), goalId: emergency.id, date: addDays(c.startDate, 1), amount: 100_000 })
    s.goalContributions.push({ id: id(), goalId: umrah.id, date: addDays(c.startDate, 2), amount: 80_000 })
  }

  // Investments.
  const rajhi = { id: id(), name: 'Al Rajhi Bank', symbol: '1120', archived: false }
  const sabic = { id: id(), name: 'SABIC', symbol: '2010', archived: false }
  const etf = { id: id(), name: 'S&P 500 ETF', symbol: 'SPY', archived: false }
  s.holdings = [rajhi, sabic, etf]
  for (const [i, c] of s.cycles.entries()) {
    s.holdingTransactions.push({ id: id(), holdingId: rajhi.id, date: addDays(c.startDate, 3), kind: 'buy', amount: 200_000, quantity: 22 + i })
    s.holdingTransactions.push({ id: id(), holdingId: etf.id, date: addDays(c.startDate, 3), kind: 'buy', amount: 150_000 })
  }
  s.holdingTransactions.push({ id: id(), holdingId: sabic.id, date: addDays(start, 4), kind: 'buy', amount: 300_000, quantity: 40 })
  s.holdingValuations.push({ id: id(), holdingId: rajhi.id, date: addDays(today, -1), value: 641_500 })
  s.holdingValuations.push({ id: id(), holdingId: sabic.id, date: addDays(today, -1), value: 276_000 })
  s.holdingValuations.push({ id: id(), holdingId: etf.id, date: addDays(today, -10), value: 452_000 })
  return s
}
