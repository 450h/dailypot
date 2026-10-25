import { describe, expect, it } from 'vitest'
import type { AppState, Goal, Holding, HoldingTransaction } from '../schema'
import { anchorForBalanceNow, balanceSeries, computeBalance, netFlow, netWorth } from './balance'
import { baseState, bill, id, pay, sar, skip, spend } from './testkit'

const today = '2026-10-10'

function goal(s: AppState, archived = false): Goal {
  const g: Goal = { id: id(), name: 'Car', targetAmount: sar(10000), archived, createdAt: 'x'.repeat(10) }
  s.goals.push(g)
  return g
}
function contribute(s: AppState, g: Goal, date: string, amount: number): void {
  s.goalContributions.push({ id: id(), goalId: g.id, date, amount: sar(amount) })
}
function holding(s: AppState, archived = false): Holding {
  const h: Holding = { id: id(), name: 'ACME', archived }
  s.holdings.push(h)
  return h
}
function trade(s: AppState, h: Holding, date: string, kind: HoldingTransaction['kind'], amount: number): void {
  s.holdingTransactions.push({ id: id(), holdingId: h.id, date, kind, amount: sar(amount) })
}

/** One cycle from 1 Oct with every flow kind once, plus items outside the window. */
function fixture(): { s: AppState; g: Goal } {
  const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
  spend(s, '2026-09-30', 999) // before the first cycle: outside the window
  spend(s, '2026-10-01', 1000, 'income')
  spend(s, '2026-10-02', 50)
  spend(s, '2026-10-03', 100, 'nonDaily')
  const phone = bill(s, 'Phone', 80, 5, '2026-10')
  pay(s, phone, '2026-10', '2026-10-05')
  const gym = bill(s, 'Gym', 150, 7, '2026-10')
  skip(s, gym, '2026-10', '2026-10-07') // skipped: not a cash flow
  const g = goal(s)
  contribute(s, g, '2026-10-06', 200)
  contribute(s, g, '2026-10-08', -50) // withdrawal back to the main balance
  const h = holding(s)
  trade(s, h, '2026-10-04', 'buy', 300)
  trade(s, h, '2026-10-09', 'sell', 100)
  spend(s, '2026-10-20', 5000, 'income') // after today: ignored
  return { s, g }
}

describe('main balance (docs/05 §10)', () => {
  it('unanchored: the window starts at the first cycle and every flow kind is signed correctly', () => {
    const { s } = fixture()
    const r = computeBalance(s, today)
    expect(r).toMatchObject({ anchored: false, since: '2026-10-01' })
    expect(r.flows).toEqual({ income: sar(1000), daily: sar(50), nonDaily: sar(100), bills: sar(80), goals: sar(150), investments: sar(200) })
    expect(netFlow(r.flows)).toBe(sar(1000 - 50 - 100 - 80 - 150 - 200))
    expect(r.balance).toBe(sar(420))
  })

  it('anchored at a later date: earlier flows are ignored; a goal withdrawal and a sell add cash', () => {
    const { s } = fixture()
    s.settings.balanceAnchor = { date: '2026-10-05', amount: sar(5000) }
    const r = computeBalance(s, today)
    expect(r).toMatchObject({ anchored: true, since: '2026-10-05' })
    expect(r.flows).toEqual({ income: 0, daily: 0, nonDaily: 0, bills: sar(80), goals: sar(150), investments: sar(-100) })
    expect(r.balance).toBe(sar(5000 - 80 - 150 + 100))
  })

  it('has no window without cycles or an anchor; an anchor alone is enough', () => {
    const s = baseState([])
    spend(s, '2026-10-01', 1000, 'income')
    expect(computeBalance(s, today)).toEqual({
      anchored: false,
      since: null,
      balance: 0,
      flows: { income: 0, daily: 0, nonDaily: 0, bills: 0, goals: 0, investments: 0 }
    })
    expect(balanceSeries(s, today, 7)).toEqual([])
    s.settings.balanceAnchor = { date: '2026-10-01', amount: sar(100) }
    expect(computeBalance(s, today)).toMatchObject({ anchored: true, since: '2026-10-01', balance: sar(1100) })
  })

  it('ignores items dated after today (clock safety)', () => {
    const { s } = fixture()
    const before = computeBalance(s, today).balance
    spend(s, '2026-10-11', 777)
    pay(s, bill(s, 'Rent', 500, 15, '2026-10'), '2026-10', '2026-10-15')
    expect(computeBalance(s, today).balance).toBe(before)
    expect(balanceSeries(s, today, 3).at(-1)?.balance).toBe(before)
  })

  it('balanceSeries: end-of-day points clipped to the window, agreeing with computeBalance today', () => {
    const { s } = fixture()
    const five = balanceSeries(s, today, 5)
    expect(five).toEqual([
      { date: '2026-10-06', balance: sar(270) },
      { date: '2026-10-07', balance: sar(270) },
      { date: '2026-10-08', balance: sar(320) },
      { date: '2026-10-09', balance: sar(420) },
      { date: '2026-10-10', balance: sar(420) }
    ])
    expect(five.at(-1)!.balance).toBe(computeBalance(s, today).balance)
    const all = balanceSeries(s, today, 100)
    expect(all).toHaveLength(10)
    expect(all[0]).toEqual({ date: '2026-10-01', balance: sar(1000) })
    expect(balanceSeries(s, today, 0)).toEqual([])
    s.settings.balanceAnchor = { date: '2026-10-05', amount: sar(5000) }
    const anchored = balanceSeries(s, today, 100)
    expect(anchored[0]).toEqual({ date: '2026-10-05', balance: sar(5000 - 80) })
    expect(anchored.at(-1)!.balance).toBe(computeBalance(s, today).balance)
  })

  it('anchorForBalanceNow round-trips: the computed balance equals what the user typed', () => {
    const { s } = fixture()
    spend(s, today, 30)
    spend(s, today, 100, 'income')
    const anchor = anchorForBalanceNow(s, today, sar(1234))
    expect(anchor).toEqual({ date: today, amount: sar(1234 - (100 - 30)) })
    s.settings.balanceAnchor = anchor
    expect(computeBalance(s, today)).toMatchObject({ anchored: true, since: today, balance: sar(1234) })
    expect(balanceSeries(s, today, 30)).toEqual([{ date: today, balance: sar(1234) }])
  })

  it('an anchor dated after today (clock rolled back) counts its amount alone; the series is the single point today', () => {
    const { s } = fixture()
    s.settings.balanceAnchor = { date: '2026-10-12', amount: sar(900) }
    const r = computeBalance(s, today)
    expect(r).toMatchObject({ anchored: true, since: '2026-10-12', balance: sar(900) })
    expect(netFlow(r.flows)).toBe(0)
    expect(balanceSeries(s, today, 30)).toEqual([{ date: today, balance: sar(900) }])
    expect(balanceSeries(s, today, 1)).toEqual([{ date: today, balance: sar(900) }])
  })
})

describe('net worth (docs/05 §10)', () => {
  it('adds cash, active goal savings and the active portfolio value; archived goals and holdings are excluded', () => {
    const { s, g } = fixture()
    const archivedGoal = goal(s, true)
    contribute(s, archivedGoal, '2026-09-15', 500) // archived and before the window
    contribute(s, g, '2026-10-25', 1000) // after today: ignored
    const archivedHolding = holding(s, true)
    trade(s, archivedHolding, '2026-09-15', 'buy', 700)
    expect(netWorth(s, today)).toEqual({ cash: sar(420), savings: sar(150), investments: sar(200), total: sar(770), anchored: false })
    s.settings.balanceAnchor = { date: '2026-10-05', amount: sar(5000) }
    expect(netWorth(s, today)).toMatchObject({ cash: sar(4870), anchored: true, total: sar(4870 + 150 + 200) })
  })

  it('ignores a holding buy and a valuation dated after today, like the cash side (clock safety)', () => {
    const { s } = fixture()
    const before = netWorth(s, today)
    const h = s.holdings[0]!
    trade(s, h, '2026-10-15', 'buy', 500)
    s.holdingValuations.push({ id: id(), holdingId: h.id, date: '2026-10-20', value: sar(99999) })
    expect(netWorth(s, today)).toEqual(before)
    // A valuation dated today still counts.
    s.holdingValuations.push({ id: id(), holdingId: h.id, date: today, value: sar(250) })
    expect(netWorth(s, today)).toEqual({ ...before, investments: sar(250), total: before.cash + before.savings + sar(250) })
  })

  it('archiving a goal or holding that still holds money closes it: net worth drops by that amount, cash is unchanged', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
    const g = goal(s)
    contribute(s, g, '2026-10-02', 300)
    const h = holding(s)
    trade(s, h, '2026-10-03', 'buy', 200)
    expect(netWorth(s, today)).toEqual({ cash: sar(-500), savings: sar(300), investments: sar(200), total: 0, anchored: false })
    g.archived = true
    expect(netWorth(s, today)).toEqual({ cash: sar(-500), savings: 0, investments: sar(200), total: sar(-300), anchored: false })
    h.archived = true
    expect(netWorth(s, today)).toEqual({ cash: sar(-500), savings: 0, investments: 0, total: sar(-500), anchored: false })
  })
})
