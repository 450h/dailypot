import { describe, expect, it } from 'vitest'
import { addDays, addMonths, clampedDayIn, dateRange, diffDays, isValidDate, isValidMonth, todayLocal } from './dates'
import { formatAmount, parseMoney, toDecimalString } from './money'

describe('dates', () => {
  it('validates real dates only', () => {
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2027-02-29')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-1-01')).toBe(false)
    expect(isValidMonth('2026-12')).toBe(true)
    expect(isValidMonth('2026-00')).toBe(false)
  })

  it('does arithmetic without time-zone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(diffDays('2026-10-13', '2026-11-26')).toBe(44)
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
    expect(clampedDayIn('2027-02', 31)).toBe('2027-02-28')
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(todayLocal(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13')
  })
})

describe('money (ADR-0003)', () => {
  it('parses user input to minor units', () => {
    expect(parseMoney('70')).toBe(7000)
    expect(parseMoney('70.5')).toBe(7050)
    expect(parseMoney('70,50')).toBeNull()
    expect(parseMoney('1,50')).toBeNull()
    expect(parseMoney(' 1 000.01 ')).toBe(100001)
    expect(parseMoney('0.1')).toBe(10)
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney('1.234')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('10000000.01')).toBeNull()
  })

  it('formats without float error', () => {
    expect(formatAmount(123456)).toBe('1,234.56')
    expect(formatAmount(-5)).toBe('-0.05')
    expect(toDecimalString(7050)).toBe('70.50')
    expect(10 + 20).toBe(30) // 0.10 + 0.20 in minor units
  })
})
