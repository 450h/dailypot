import { describe, expect, it } from 'vitest'
import { dashboardBills, earmarks, safeToSpend, unloggedDays } from './guidance'
import { computePot } from './pot'
import { baseState, bill, id, pay, sar, skip, spend } from './testkit'

describe('safe-to-spend (docs/05 §5, QA B2)', () => {
  it('accounts for a pot deficit (S4): pot −100, phone 80 due in 9 days → 50/day', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-11', allowance: 70 }])
    bill(s, 'Phone', 80, 11, '2026-10')
    spend(s, '2026-10-01', 170)
    const today = '2026-10-02'
    const pot = computePot(s, today)
    expect(pot.balance).toBe(sar(-100))
    const g = safeToSpend(pot, s.cycles[0]!, today)
    expect(g.safeDaily).toBe(sar(50))
    expect(g.allFunded).toBe(false)

    // Following the advice exactly funds the bill from the pot.
    for (let d = 2; d <= 10; d++) spend(s, `2026-10-${String(d).padStart(2, '0')}`, 50)
    const p = pay(s, s.obligations[0]!, '2026-10', '2026-10-11')
    expect(computePot(s, '2026-10-11').splits.get(p.id)).toMatchObject({ fromPot: sar(80), fromMain: 0 })
  })

  it('accounts for due dates (S5): pot 0, phone due tomorrow → negative safe daily + unavoidable shortfall', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
    bill(s, 'Phone', 80, 3, '2026-10')
    spend(s, '2026-10-01', 70)
    const today = '2026-10-02'
    const g = safeToSpend(computePot(s, today), s.cycles[0]!, today)
    expect(g.safeDaily).toBe(sar(-10))
    expect(g.unavoidableShortfall).toBe(sar(10))
  })

  it('due-today and overdue bills that the pot cannot cover are reported as fromMainNow', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
    bill(s, 'Phone', 80, 2, '2026-10')
    spend(s, '2026-10-01', 40)
    const g = safeToSpend(computePot(s, '2026-10-02'), s.cycles[0]!, '2026-10-02')
    expect(g.fromMainNow).toBe(sar(50))
    expect(g.safeDaily).toBe(sar(70))
  })

  it('full per-day is safe when every bill is funded', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
    bill(s, 'Phone', 80, 20, '2026-10')
    spend(s, '2026-10-01', 0)
    spend(s, '2026-10-02', 0)
    const g = safeToSpend(computePot(s, '2026-10-03'), s.cycles[0]!, '2026-10-03')
    expect(g).toMatchObject({ safeDaily: sar(70), allFunded: true })
  })

  it('a skipped bill does not lower safe-to-spend (QA B3)', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 70 }])
    const gym = bill(s, 'Gym', 1500, 5, '2026-10')
    skip(s, gym, '2026-10', '2026-10-01')
    const g = safeToSpend(computePot(s, '2026-10-02'), s.cycles[0]!, '2026-10-02')
    expect(g.safeDaily).toBe(sar(70))
  })
})

describe('earmarks and dashboard bills', () => {
  it('allocates the pot nearest-due first', () => {
    const s = baseState([{ startDate: '2026-10-01', endDate: '2026-10-30', allowance: 60 }])
    const phone = bill(s, 'Phone', 80, 10, '2026-10')
    const gym = bill(s, 'Gym', 150, 15, '2026-10')
    const pot = computePot(s, '2026-10-03') // pot 120
    const e = earmarks(pot, s.cycles[0]!)
    expect(e.get(`${phone.id}:2026-10`)).toBe(sar(80))
    expect(e.get(`${gym.id}:2026-10`)).toBe(sar(40))
  })

  it('lists this cycle, earlier unsettled and prepaid future bills', () => {
    const s = baseState([
      { startDate: '2026-09-27', endDate: '2026-10-26', allowance: 70 },
      { startDate: '2026-10-27', endDate: '2026-11-26', allowance: 70 }
    ])
    const phone = bill(s, 'Phone', 80, 25, '2026-10') // Oct instance overdue from cycle 1
    const gym = bill(s, 'Gym', 150, 5, '2026-10') // Oct paid (cycle 1, hidden), Nov in cycle 2
    pay(s, gym, '2026-10', '2026-10-05')
    pay(s, gym, '2026-12', '2026-10-28') // prepaid future
    const today = '2026-10-29'
    const rows = dashboardBills(computePot(s, today), s.cycles[1]!, today)
    expect(rows.map((r) => `${r.instance.name}:${r.instance.period}:${r.status}`)).toEqual([
      'Phone:2026-10:overdue',
      'Gym:2026-11:upcoming',
      'Phone:2026-11:upcoming',
      'Gym:2026-12:paid'
    ])
    expect(phone).toBeDefined()
  })
})

describe('unlogged days helper (docs/05 §5)', () => {
  it('returns closed unlogged days newest first, within an optional range', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-02', 10)
    s.confirmedDays.push({ id: id(), date: '2026-11-04' })
    const pot = computePot(s, '2026-11-06')
    expect(unloggedDays(pot).map((d) => d.date)).toEqual(['2026-11-05', '2026-11-03', '2026-11-01'])
    expect(unloggedDays(pot, '2026-11-02', '2026-11-05').map((d) => d.date)).toEqual(['2026-11-05', '2026-11-03'])
    expect(unloggedDays(pot, undefined, '2026-11-01').map((d) => d.date)).toEqual(['2026-11-01'])
    expect(unloggedDays(pot, '2026-11-06').map((d) => d.date)).toEqual([])
  })
})
