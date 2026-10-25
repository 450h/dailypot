import { describe, expect, it } from 'vitest'
import { computePot } from './pot'
import { cycleSummary, goalFigures, holdingFigures, monthsLeft, portfolioTotals, spendingByCategory } from './reports'
import { baseState, bill, id, pay, sar, spend } from './testkit'
import type { Goal, Holding } from '../schema'

describe('cycle summary (docs/05 §6)', () => {
  it('computes cash flow and attributes bill splits by payment date', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-01', 20)
    spend(s, '2026-11-01', 300, 'nonDaily')
    spend(s, '2026-11-01', 10000, 'income')
    const phone = bill(s, 'Phone', 80, 2, '2026-11')
    pay(s, phone, '2026-11', '2026-11-02')
    const goal: Goal = { id: id(), name: 'Car', targetAmount: sar(1000), archived: false, createdAt: 'x'.repeat(10) }
    s.goals.push(goal)
    s.goalContributions.push({ id: id(), goalId: goal.id, date: '2026-11-02', amount: sar(500) })
    const h: Holding = { id: id(), name: 'ACME', archived: false }
    s.holdings.push(h)
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-11-02', kind: 'buy', amount: sar(1000) })

    const today = '2026-11-03'
    const sum = cycleSummary(s, computePot(s, today), s.cycles[0]!, today)
    expect(sum).toMatchObject({
      dailySpend: sar(20),
      nonDailySpend: sar(300),
      income: sar(10000),
      billsPaid: sar(80),
      billsFromPot: sar(50),
      billsFromMain: sar(30),
      shortfallCount: 1,
      goalNet: sar(500),
      investmentNet: sar(1000),
      totalAllowance: sar(70 * 30),
      openingPot: 0,
      closingPot: null
    })
    expect(sum.cashFlow).toBe(sar(10000 - (20 + 300 + 80 + 500 + 1000)))
  })

  it('a goal withdrawal or a holding sale is a net inflow: goalNet / investmentNet go negative and cash flow exceeds income', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-01', 200)
    spend(s, '2026-11-01', 1000, 'income')
    const goal: Goal = { id: id(), name: 'Car', targetAmount: sar(1000), archived: false, createdAt: 'x'.repeat(10) }
    s.goals.push(goal)
    s.goalContributions.push({ id: id(), goalId: goal.id, date: '2026-11-02', amount: -sar(500) })
    const h: Holding = { id: id(), name: 'ACME', archived: false }
    s.holdings.push(h)
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-11-02', kind: 'buy', amount: sar(100) })
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-11-02', kind: 'sell', amount: sar(400) })

    const today = '2026-11-03'
    const sum = cycleSummary(s, computePot(s, today), s.cycles[0]!, today)
    expect(sum.goalNet).toBe(-sar(500))
    expect(sum.investmentNet).toBe(-sar(300))
    expect(sum.cashFlow).toBe(sar(1000 - (200 + 0 + 0 - 500 - 300)))
    expect(sum.cashFlow).toBeGreaterThan(sum.income)
  })

  it('groups spending by category, excluding income', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-01', 20)
    spend(s, '2026-11-02', 30, 'nonDaily')
    spend(s, '2026-11-02', 999, 'income')
    const rows = spendingByCategory(s, '2026-11-01', '2026-11-30')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ daily: sar(20), nonDaily: sar(30), total: sar(50) })
  })
})

describe('goals (docs/05 §7)', () => {
  it('months left uses calendar months rounded up, min 1', () => {
    expect(monthsLeft('2026-10-13', '2027-06-13')).toBe(8)
    expect(monthsLeft('2026-10-13', '2027-06-14')).toBe(9)
    expect(monthsLeft('2026-10-13', '2026-10-20')).toBe(1)
  })

  it('needed per month rounds up and caps progress', () => {
    const s = baseState([])
    const goal: Goal = { id: id(), name: 'Car', targetAmount: sar(1000), targetDate: '2027-01-13', archived: false, createdAt: 'x'.repeat(10) }
    s.goalContributions.push({ id: id(), goalId: goal.id, date: '2026-10-01', amount: sar(100) })
    const g = goalFigures(s, goal, '2026-10-13')
    expect(g).toMatchObject({ saved: sar(100), remaining: sar(900), neededPerMonth: sar(300), targetPassed: false })
    s.goalContributions.push({ id: id(), goalId: goal.id, date: '2026-10-02', amount: sar(2000) })
    expect(goalFigures(s, goal, '2026-10-13').progress).toBe(1)
    expect(goalFigures(s, goal, '2027-02-01')).toMatchObject({ targetPassed: true, neededPerMonth: null })
  })
})

describe('investments (docs/05 §7)', () => {
  const setup = () => {
    const s = baseState([])
    const h: Holding = { id: id(), name: 'ACME', archived: false }
    s.holdings.push(h)
    return { s, h }
  }

  it('no valuation → value = net invested', () => {
    const { s, h } = setup()
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-01', kind: 'buy', amount: sar(1000) })
    expect(holdingFigures(s, h)).toMatchObject({ netInvested: sar(1000), value: sar(1000), basis: 'noValuation', gainPct: 0 })
  })

  it('flows after the latest valuation make it an estimate (QA N4)', () => {
    const { s, h } = setup()
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-01', kind: 'buy', amount: sar(1000) })
    s.holdingValuations.push({ id: id(), holdingId: h.id, date: '2026-10-05', value: sar(1100) })
    expect(holdingFigures(s, h)).toMatchObject({ value: sar(1100), basis: 'valuation', gain: sar(100) })
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-06', kind: 'buy', amount: sar(1000) })
    expect(holdingFigures(s, h)).toMatchObject({ value: sar(2100), basis: 'estimated', gain: sar(100) })
  })

  it('with `today`, transactions and valuations dated after it are ignored (docs/05 §5 rule 8)', () => {
    const { s, h } = setup()
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-01', kind: 'buy', amount: sar(1000) })
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-15', kind: 'buy', amount: sar(500) })
    s.holdingValuations.push({ id: id(), holdingId: h.id, date: '2026-10-20', value: sar(5000) })
    expect(holdingFigures(s, h, '2026-10-10')).toMatchObject({ netInvested: sar(1000), value: sar(1000), basis: 'noValuation', valuationDate: null })
    expect(holdingFigures(s, h, '2026-10-20')).toMatchObject({ netInvested: sar(1500), value: sar(5000), basis: 'valuation' })
    expect(holdingFigures(s, h)).toEqual(holdingFigures(s, h, '2026-10-20'))
  })

  it('fully sold holdings are closed with realised gain', () => {
    const { s, h } = setup()
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-01', kind: 'buy', amount: sar(1000) })
    s.holdingTransactions.push({ id: id(), holdingId: h.id, date: '2026-10-09', kind: 'sell', amount: sar(1200) })
    s.holdingValuations.push({ id: id(), holdingId: h.id, date: '2026-10-09', value: 0 })
    const f = holdingFigures(s, h)
    expect(f).toMatchObject({ basis: 'closed', value: 0, netInvested: sar(-200), gain: sar(200), gainPct: null })
    expect(portfolioTotals([f]).gain).toBe(sar(200))
  })
})
