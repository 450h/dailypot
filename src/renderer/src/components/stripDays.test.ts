import { describe, expect, it } from 'vitest'
import type { DayRow } from '@shared/engine'
import { stripDaysFor, stripLabel, stripState } from './stripDays'

const today = '2026-10-25'
const row = (date: string, over: Partial<DayRow> = {}): DayRow => ({
  date,
  cycleId: 'c1',
  allowance: 7000,
  spent: 0,
  delta: 7000,
  closed: date < today,
  payments: [],
  balanceAfter: 0,
  unlogged: false,
  confirmed: false,
  ...over
})

describe('Day Strip mapping (docs/10 §5.2, one definition for both pages)', () => {
  it('maps the six states', () => {
    expect(stripState(row('2026-10-26', { closed: false }), today)).toBe('future')
    expect(stripState(row('2026-10-25', { spent: 1200, delta: 5800 }), today)).toBe('today')
    expect(stripState(row('2026-10-24', { unlogged: true }), today)).toBe('unlogged')
    expect(stripState(row('2026-10-23', { confirmed: true }), today)).toBe('confirmed')
    expect(stripState(row('2026-10-22', { spent: 9000, delta: -2000 }), today)).toBe('drew')
    expect(stripState(row('2026-10-21', { spent: 3000, delta: 4000 }), today)).toBe('fed')
  })

  it('a day confirmed as spent nothing that later received an entry is fed/drew, not a no-spend dot', () => {
    expect(stripState(row('2026-10-20', { confirmed: true, spent: 3000, delta: 4000 }), today)).toBe('fed')
    expect(stripState(row('2026-10-20', { confirmed: true, spent: 8000, delta: -1000 }), today)).toBe('drew')
  })

  it('labels say the state in words with the amounts', () => {
    expect(stripLabel(row('2026-10-24', { unlogged: true }), 'unlogged')).toBe('Sat 24 Oct, unlogged, added your full per-day 70.00 to the pot')
    expect(stripLabel(row('2026-10-23', { confirmed: true }), 'confirmed')).toBe('Fri 23 Oct, spent nothing, 70.00 to the pot')
    expect(stripLabel(row('2026-10-22', { spent: 9000, delta: -2000 }), 'drew')).toBe('Thu 22 Oct, spent 90.00, 20.00 from the pot')
    expect(stripLabel(row('2026-10-21', { spent: 3000, delta: 4000 }), 'fed')).toBe('Wed 21 Oct, spent 30.00, 40.00 to the pot')
    expect(stripLabel(row('2026-10-25', { spent: 1200, delta: 5800 }), 'today')).toBe('Sun 25 Oct, today, spent 12.00 so far')
  })

  it('builds one cell per cycle day; days without a row are future', () => {
    const rows = [row('2026-10-23', { confirmed: true }), row('2026-10-24', { unlogged: true }), row('2026-10-25', { spent: 500, delta: 6500 })]
    const cells = stripDaysFor(rows, { startDate: '2026-10-23', endDate: '2026-10-27' }, today)
    expect(cells.map((c) => c.state)).toEqual(['confirmed', 'unlogged', 'today', 'future', 'future'])
    expect(cells[4]).toEqual({ date: '2026-10-27', state: 'future', label: 'Tue 27 Oct, upcoming' })
    expect(cells[2]).toMatchObject({ spent: 500, delta: 6500 })
  })
})
