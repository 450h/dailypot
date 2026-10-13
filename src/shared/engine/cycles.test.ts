import { describe, expect, it } from 'vitest'
import { cycleEndFor, earlyStartWindow, ensureCycles, nextPaydayAfter, startNextEarly, validateFirstCycleStart } from './cycles'
import { allInstances, defaultStartMonth, instancesOf } from './obligations'
import { id, sar } from './testkit'
import type { Cycle, Obligation } from '../schema'

const chain = (start: string, payday: number, n: number): Array<[string, string]> => {
  const out: Array<[string, string]> = []
  let s = start
  for (let i = 0; i < n; i++) {
    const e = cycleEndFor(s, payday)
    out.push([s, e])
    const d = new Date(`${e}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    s = d.toISOString().slice(0, 10)
  }
  return out
}

describe('cycles (docs/05 §3)', () => {
  it('payday 27: first partial cycle then full cycles', () => {
    expect(cycleEndFor('2026-10-13', 27)).toBe('2026-10-26')
    expect(cycleEndFor('2026-10-27', 27)).toBe('2026-11-26')
    expect(nextPaydayAfter('2026-10-27', 27)).toBe('2026-11-27')
  })

  it('payday 31 clamps across February 2027 (non-leap) and 2028 (leap) — QA S2', () => {
    expect(chain('2026-12-31', 31, 4)).toEqual([
      ['2026-12-31', '2027-01-30'],
      ['2027-01-31', '2027-02-27'],
      ['2027-02-28', '2027-03-30'],
      ['2027-03-31', '2027-04-29']
    ])
    expect(chain('2028-01-31', 31, 2)).toEqual([
      ['2028-01-31', '2028-02-28'],
      ['2028-02-29', '2028-03-30']
    ])
  })

  it('ensureCycles catches up several cycles and copies the last allowance', () => {
    const c: Cycle = { id: id(), startDate: '2026-10-13', endDate: '2026-10-26', dailyAllowance: sar(70) }
    const { cycles, added } = ensureCycles([c], 27, '2027-01-02', id)
    expect(added).toBe(3)
    expect(cycles.map((x) => [x.startDate, x.endDate])).toEqual([
      ['2026-10-13', '2026-10-26'],
      ['2026-10-27', '2026-11-26'],
      ['2026-11-27', '2026-12-26'],
      ['2026-12-27', '2027-01-26']
    ])
    expect(cycles.every((x) => x.dailyAllowance === sar(70))).toBe(true)
    expect(ensureCycles(cycles, 27, '2027-01-02', id).added).toBe(0)
  })

  it('a payday change applies only to newly created cycles', () => {
    const c: Cycle = { id: id(), startDate: '2026-10-13', endDate: '2026-10-26', dailyAllowance: 0 }
    const { cycles } = ensureCycles([c], 1, '2026-10-27', id)
    expect(cycles[1]).toMatchObject({ startDate: '2026-10-27', endDate: '2026-10-31' })
  })

  describe('start next cycle early (QA B1)', () => {
    const cur = (): Cycle => ({ id: id(), startDate: '2026-09-27', endDate: '2026-10-26', dailyAllowance: sar(70) })

    it('absorbs the replaced payday: 27 Sep–23 Oct and 24 Oct–26 Nov', () => {
      const out = startNextEarly([cur()], 27, '2026-10-24', '2026-10-24', id)
      expect(out.map((x) => [x.startDate, x.endDate])).toEqual([
        ['2026-09-27', '2026-10-23'],
        ['2026-10-24', '2026-11-26']
      ])
      expect(out[1]!.dailyAllowance).toBe(sar(70))
    })

    it('allows a back-dated start inside the window', () => {
      const out = startNextEarly([cur()], 27, '2026-10-24', '2026-10-21', id)
      expect(out[0]!.endDate).toBe('2026-10-20')
    })

    it('refuses outside the 7-day window or out-of-range start dates', () => {
      expect(earlyStartWindow(cur(), '2026-10-19').allowed).toBe(false)
      expect(earlyStartWindow(cur(), '2026-10-20').allowed).toBe(true)
      expect(() => startNextEarly([cur()], 27, '2026-10-15', '2026-10-15', id)).toThrow()
      expect(() => startNextEarly([cur()], 27, '2026-10-24', '2026-10-19', id)).toThrow()
      expect(() => startNextEarly([cur()], 27, '2026-10-24', '2026-10-25', id)).toThrow()
    })
  })

  it('validates the first cycle start (QA B6)', () => {
    expect(validateFirstCycleStart('2026-10-14', '2026-10-13')).toMatch(/future/)
    expect(validateFirstCycleStart('2026-10-13', '2026-10-13')).toBeNull()
    expect(validateFirstCycleStart('2026-08-12', '2026-10-13')).toBeNull()
    expect(validateFirstCycleStart('2026-08-11', '2026-10-13')).toMatch(/62/)
  })
})

describe('obligation instances (docs/05 §4)', () => {
  const ob = (dueDay: number, startMonth: string, endMonth?: string): Obligation => ({
    id: id(),
    name: 'Bill',
    amount: sar(30),
    dueDay,
    startMonth,
    ...(endMonth ? { endMonth } : {})
  })

  it('one instance per month, clamped to month end', () => {
    const inst = instancesOf(ob(31, '2027-01'), '2027-01-01', '2027-04-30')
    expect(inst.map((i) => i.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  })

  it('respects start and end months', () => {
    const inst = instancesOf(ob(5, '2026-11', '2027-01'), '2026-01-01', '2027-12-31')
    expect(inst.map((i) => i.period)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('payday-31 cycles can hold 0 or 2 instances of a due-30 bill (QA S2)', () => {
    const o = ob(30, '2027-01')
    expect(allInstances([o], '2027-01-31', '2027-02-27')).toHaveLength(0)
    expect(allInstances([o], '2027-02-28', '2027-03-30').map((i) => i.dueDate)).toEqual(['2027-02-28', '2027-03-30'])
  })

  it('default start month skips a due date that already passed (QA B3)', () => {
    expect(defaultStartMonth(15, '2026-10-20')).toBe('2026-11')
    expect(defaultStartMonth(25, '2026-10-20')).toBe('2026-10')
    expect(defaultStartMonth(20, '2026-10-20')).toBe('2026-10')
  })
})
