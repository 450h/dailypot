import { describe, expect, it } from 'vitest'
import { pastBillsToSkip } from './obligations'
import { baseState, bill, pay, skip } from './testkit'

describe('pastBillsToSkip (docs/05 §3 skipPastBills)', () => {
  const today = '2026-10-13'

  it('lists the unsettled months due in the range and before today, oldest first', () => {
    const s = baseState([])
    const phone = bill(s, 'Phone', 80, 25, '2026-06')
    const out = pastBillsToSkip(s.obligations, s.obligationPayments, '2026-07-01', '2026-10-12', today)
    expect(out.map((i) => i.period)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(out[0]).toMatchObject({ obligationId: phone.id, dueDate: '2026-07-25' })
  })

  it('excludes a month with a settlement row dated on or before today', () => {
    const s = baseState([])
    const phone = bill(s, 'Phone', 80, 25, '2026-06')
    pay(s, phone, '2026-08', '2026-08-25')
    skip(s, phone, '2026-07', '2026-10-01')
    expect(pastBillsToSkip(s.obligations, s.obligationPayments, '2026-07-01', '2026-10-12', today).map((i) => i.period)).toEqual(['2026-09'])
  })

  it('excludes a month whose settlement row is dated after today (a month is settled at most once)', () => {
    const s = baseState([])
    const phone = bill(s, 'Phone', 80, 25, '2026-06')
    pay(s, phone, '2026-08', '2026-11-01')
    expect(pastBillsToSkip(s.obligations, s.obligationPayments, '2026-07-01', '2026-10-12', today).map((i) => i.period)).toEqual(['2026-07', '2026-09'])
  })

  it('excludes months due on or after today (the clock rolled back) and outside the range', () => {
    const s = baseState([])
    bill(s, 'Phone', 80, 5, '2026-06')
    // Range covers Sep and Oct due dates; today is 1 Oct, so only September is "before today".
    expect(pastBillsToSkip(s.obligations, s.obligationPayments, '2026-09-01', '2026-10-12', '2026-10-01').map((i) => i.period)).toEqual(['2026-09'])
    expect(pastBillsToSkip(s.obligations, s.obligationPayments, '2026-09-01', '2026-10-12', '2026-10-05').map((i) => i.period)).toEqual(['2026-09'])
    expect(pastBillsToSkip(s.obligations, s.obligationPayments, '2026-09-01', '2026-10-12', '2026-10-06').map((i) => i.period)).toEqual(['2026-09', '2026-10'])
  })
})
