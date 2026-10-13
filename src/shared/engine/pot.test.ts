import { describe, expect, it } from 'vitest'
import { computePot } from './pot'
import { baseState, bill, pay, sar, skip, spend } from './testkit'

const day = (pot: ReturnType<typeof computePot>, date: string) => pot.days.find((d) => d.date === date)!

describe('pot — worked example (docs/05 §5)', () => {
  const build = () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    const phone = bill(s, 'Phone', 80, 5, '2026-11')
    spend(s, '2026-11-01', 10)
    spend(s, '2026-11-02', 70)
    const d3 = spend(s, '2026-11-03', 100)
    spend(s, '2026-11-04', 20)
    spend(s, '2026-11-05', 40)
    const p = pay(s, phone, '2026-11', '2026-11-05')
    return { s, p, d3 }
  }

  it('matches the table day by day', () => {
    const { s, p } = build()
    const pot = computePot(s, '2026-11-06')
    expect(day(pot, '2026-11-01').balanceAfter).toBe(sar(60))
    expect(day(pot, '2026-11-02').balanceAfter).toBe(sar(60))
    expect(day(pot, '2026-11-03').balanceAfter).toBe(sar(30))
    expect(day(pot, '2026-11-04').balanceAfter).toBe(sar(80))
    expect(pot.splits.get(p.id)).toMatchObject({ fromPot: sar(80), fromMain: 0 })
    expect(day(pot, '2026-11-05').balanceAfter).toBe(sar(30))
    expect(pot.balance).toBe(sar(30))
  })

  it('today is open: delta is projected, not added', () => {
    const { s } = build()
    spend(s, '2026-11-06', 20)
    const pot = computePot(s, '2026-11-06')
    expect(pot.balance).toBe(sar(30))
    expect(pot.projected).toBe(sar(80))
    expect(day(pot, '2026-11-06').closed).toBe(false)
  })

  it('recomputes when a past expense is edited (ADR-0004)', () => {
    const { s, d3 } = build()
    d3.amount = sar(50)
    const pot = computePot(s, '2026-11-06')
    expect(day(pot, '2026-11-04').balanceAfter).toBe(sar(130))
    expect(pot.balance).toBe(sar(80))
  })
})

describe('pot — overspend and deficits', () => {
  it('overspend drains the pot below zero and a bill then comes from main', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    const phone = bill(s, 'Phone', 80, 2, '2026-11')
    spend(s, '2026-11-01', 120)
    const p = pay(s, phone, '2026-11', '2026-11-02')
    const pot = computePot(s, '2026-11-03')
    expect(day(pot, '2026-11-01').balanceAfter).toBe(sar(-50))
    expect(pot.splits.get(p.id)).toMatchObject({ fromPot: 0, fromMain: sar(80) })
    expect(pot.balance).toBe(sar(20))
  })

  it('a partial pot covers part of a bill', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    const phone = bill(s, 'Phone', 80, 2, '2026-11')
    spend(s, '2026-11-01', 20)
    const p = pay(s, phone, '2026-11', '2026-11-02')
    const pot = computePot(s, '2026-11-02')
    expect(pot.splits.get(p.id)).toMatchObject({ fromPot: sar(50), fromMain: sar(30) })
    expect(pot.balance).toBe(0)
  })
})

describe('pot — nearest due date first (rule 4)', () => {
  const setup = () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 100 }])
    const gym = bill(s, 'Gym', 150, 3, '2026-11')
    const phone = bill(s, 'Phone', 80, 5, '2026-11')
    return { s, gym, phone }
  }

  it('paying a later-due bill first leaves pot money reserved for the earlier one', () => {
    const { s, gym, phone } = setup()
    const pp = pay(s, phone, '2026-11', '2026-11-02')
    const pg = pay(s, gym, '2026-11', '2026-11-03')
    const pot = computePot(s, '2026-11-04')
    expect(pot.splits.get(pp.id)).toMatchObject({ fromPot: 0, fromMain: sar(80), reserved: sar(150) })
    expect(pot.splits.get(pg.id)).toMatchObject({ fromPot: sar(150), fromMain: 0 })
  })

  it('reserves the eventual payment amount of a later-paid bill (QA B4a)', () => {
    const { s, gym, phone } = setup()
    spend(s, '2026-11-01', 0)
    // balance at start of day 3 = 200; phone paid day 3 at 09:00, gym paid day 4 for 120
    const pp = pay(s, phone, '2026-11', '2026-11-03')
    pay(s, gym, '2026-11', '2026-11-04', 120)
    const pot = computePot(s, '2026-11-05')
    expect(pot.splits.get(pp.id)).toMatchObject({ reserved: sar(120), fromPot: sar(80) })
  })

  it('skipped instances are never reserved (QA B3)', () => {
    const { s, gym, phone } = setup()
    skip(s, gym, '2026-11', '2026-11-01')
    const pp = pay(s, phone, '2026-11', '2026-11-02')
    const pot = computePot(s, '2026-11-03')
    expect(pot.splits.get(pp.id)).toMatchObject({ reserved: 0, fromPot: sar(80) })
  })

  it('same-day payments are processed in instance order', () => {
    const { s, gym, phone } = setup()
    // balance at start of day 3 = 200
    const pp = pay(s, phone, '2026-11', '2026-11-03')
    const pg = pay(s, gym, '2026-11', '2026-11-03')
    const pot = computePot(s, '2026-11-04')
    expect(pot.splits.get(pg.id)).toMatchObject({ fromPot: sar(150) })
    expect(pot.splits.get(pp.id)).toMatchObject({ fromPot: sar(50), fromMain: sar(30) })
  })

  it('an overdue bill from a previous cycle is paid from the rolled-over pot and reserves first', () => {
    const s = baseState([
      { startDate: '2026-09-27', endDate: '2026-10-26', allowance: 10 },
      { startDate: '2026-10-27', endDate: '2026-11-26', allowance: 10 }
    ])
    const phone = bill(s, 'Phone', 80, 25, '2026-10')
    const gym = bill(s, 'Gym', 50, 28, '2026-10')
    // 30 closed days in cycle 1 → pot 300 at 10-27; gym (due 28th) paid first on 10-28
    const pg = pay(s, gym, '2026-10', '2026-10-28')
    const pp = pay(s, phone, '2026-10', '2026-10-29')
    const pot = computePot(s, '2026-10-30')
    expect(pot.splits.get(pg.id)).toMatchObject({ reserved: sar(80) })
    expect(pot.splits.get(pp.id)).toMatchObject({ fromPot: sar(80) })
  })

  it('prepaying a future instance draws from the pot', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 100 }])
    const phone = bill(s, 'Phone', 80, 5, '2026-12')
    const p = pay(s, phone, '2026-12', '2026-11-10')
    const pot = computePot(s, '2026-11-11')
    expect(pot.splits.get(p.id)).toMatchObject({ fromPot: sar(80), fromMain: 0 })
    expect(pot.instances.some((i) => i.key.endsWith('2026-12'))).toBe(true)
  })
})

describe('pot — rollover, scope and clock safety', () => {
  it('rolls over across three cycles (opening = previous closing)', () => {
    const s = baseState([
      { startDate: '2026-08-27', endDate: '2026-09-26', allowance: 10 },
      { startDate: '2026-09-27', endDate: '2026-10-26', allowance: 20 },
      { startDate: '2026-10-27', endDate: '2026-11-26', allowance: 30 }
    ])
    spend(s, '2026-09-27', 100)
    const pot = computePot(s, '2026-10-28')
    const [c1, c2, c3] = s.cycles
    expect(pot.cycleOpening.get(c1!.id)).toBe(0)
    expect(pot.cycleClosing.get(c1!.id)).toBe(sar(310))
    expect(pot.cycleOpening.get(c2!.id)).toBe(sar(310))
    expect(pot.cycleClosing.get(c2!.id)).toBe(sar(310 + 30 * 20 - 100))
    expect(pot.cycleOpening.get(c3!.id)).toBe(pot.cycleClosing.get(c2!.id))
    expect(pot.cycleClosing.get(c3!.id)).toBeNull()
  })

  it('ignores items dated after today (QA B7) and before the first cycle', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-10-20', 500)
    spend(s, '2026-11-20', 500)
    const pot = computePot(s, '2026-11-03')
    expect(pot.balance).toBe(sar(140))
  })

  it('non-daily, income, goals and investments never touch the pot', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-01', 900, 'nonDaily')
    spend(s, '2026-11-01', 9000, 'income')
    const pot = computePot(s, '2026-11-02')
    expect(pot.balance).toBe(sar(70))
  })

  it('marks unlogged days and respects confirmed no-spend days', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    spend(s, '2026-11-01', 10)
    s.confirmedDays.push({ id: crypto.randomUUID(), date: '2026-11-02' })
    const pot = computePot(s, '2026-11-04')
    expect(day(pot, '2026-11-01').unlogged).toBe(false)
    expect(day(pot, '2026-11-02')).toMatchObject({ unlogged: false, confirmed: true })
    expect(day(pot, '2026-11-03').unlogged).toBe(true)
    expect(day(pot, '2026-11-04').unlogged).toBe(false)
  })

  it('is empty before the first cycle starts', () => {
    const s = baseState([{ startDate: '2026-11-01', endDate: '2026-11-30', allowance: 70 }])
    expect(computePot(s, '2026-10-31').days).toHaveLength(0)
  })
})
