import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { computePot } from '@shared/engine'
import { MAX_AMOUNT } from '@shared/money'
import { emptyState, type AppState } from '@shared/schema'
import { CommandError, completeSetup, deleteEntity, extendBack, integrityError, rollCycles, setAllowance, upsertEntity, updateSettings, type Ctx } from './commands'

const ctx = (today = '2026-10-13'): Ctx => ({ today, nowIso: `${today}T10:00:00.000Z`, newId: randomUUID })

function setUp(today = '2026-10-13', obligations = [{ name: 'Phone', amount: 8000, dueDay: 25 }]): AppState {
  return completeSetup(emptyState(randomUUID), {
    currency: 'SAR',
    payday: 27,
    dailyAllowance: 7000,
    firstCycleStart: today,
    obligations
  }, ctx(today))
}

const expenseCat = (s: AppState) => s.categories.find((c) => c.kind === 'expense')!.id
const incomeCat = (s: AppState) => s.categories.find((c) => c.kind === 'income')!.id
const code = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    return e instanceof CommandError ? e.code : 'OTHER'
  }
  return 'NONE'
}

describe('setup', () => {
  it('creates the first cycle, obligations with default start month, and marks setup complete', () => {
    const s = setUp('2026-10-26', [{ name: 'Phone', amount: 8000, dueDay: 25 }])
    expect(s.settings.setupComplete).toBe(true)
    expect(s.cycles).toHaveLength(1)
    expect(s.cycles[0]).toMatchObject({ startDate: '2026-10-26', endDate: '2026-10-26', dailyAllowance: 7000 })
    expect(s.obligations[0]!.startMonth).toBe('2026-11')
  })

  it('rejects a future first cycle and double setup', () => {
    const base = emptyState(randomUUID)
    const payload = { currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: '2026-10-14', obligations: [] }
    expect(code(() => completeSetup(base, payload, ctx()))).toBe('INVALID')
    expect(code(() => completeSetup(setUp(), { ...payload, firstCycleStart: '2026-10-13' }, ctx()))).toBe('ALREADY_SET_UP')
  })

  it('a back-dated first cycle catches up cycles to today', () => {
    const s = completeSetup(emptyState(randomUUID), {
      currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: '2026-09-20', obligations: []
    }, ctx('2026-10-13'))
    expect(s.cycles.map((c) => c.startDate)).toEqual(['2026-09-20', '2026-09-27'])
  })
})

describe('entity upsert validation (SECURITY §1/§4)', () => {
  it('accepts a valid transaction and sets createdAt server-side', () => {
    const s = setUp()
    const id = randomUUID()
    const next = upsertEntity(s, 'transactions', { id, date: '2026-10-13', amount: 1000, kind: 'daily', categoryId: expenseCat(s), createdAt: 'forged-value' }, ctx())
    const created = next.transactions.find((t) => t.id === id)!
    expect(created.createdAt).toBe('2026-10-13T10:00:00.000Z')
    // idempotent update by id keeps createdAt
    const again = upsertEntity(next, 'transactions', { ...created, amount: 1200 }, ctx('2026-10-14'))
    expect(again.transactions).toHaveLength(1)
    expect(again.transactions[0]).toMatchObject({ amount: 1200, createdAt: '2026-10-13T10:00:00.000Z' })
  })

  it('rejects unknown collections, unknown keys, bad types, future dates and wrong category kinds', () => {
    const s = setUp()
    const tx = { id: randomUUID(), date: '2026-10-13', amount: 1000, kind: 'daily', categoryId: expenseCat(s) }
    expect(code(() => upsertEntity(s, 'cycles', tx, ctx()))).toBe('BAD_COLLECTION')
    expect(code(() => upsertEntity(s, 'settings', tx, ctx()))).toBe('BAD_COLLECTION')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, evil: 1 }, ctx()))).toBe('INVALID')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, amount: 10.5 }, ctx()))).toBe('INVALID')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, amount: -5 }, ctx()))).toBe('INVALID')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, id: 'not-a-uuid' }, ctx()))).toBe('INVALID')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, date: '2026-10-14' }, ctx()))).toBe('FUTURE_DATE')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, categoryId: incomeCat(s) }, ctx()))).toBe('CATEGORY_KIND')
    expect(code(() => upsertEntity(s, 'transactions', { ...tx, categoryId: randomUUID() }, ctx()))).toBe('NOT_FOUND')
    expect(code(() => upsertEntity(s, 'transactions', null, ctx()))).toBe('INVALID')
  })

  it('refuses writes before setup', () => {
    const s = emptyState(randomUUID)
    expect(code(() => upsertEntity(s, 'goals', { id: randomUUID(), name: 'x', targetAmount: 1, archived: false }, ctx()))).toBe('NOT_SET_UP')
  })

  describe('payments', () => {
    const pay = (s: AppState, extra: Record<string, unknown> = {}) => ({
      id: randomUUID(), obligationId: s.obligations[0]!.id, period: '2026-10', status: 'paid', date: '2026-10-13', amount: 8000, ...extra
    })

    it('accepts a valid payment and a skip', () => {
      const s = setUp()
      expect(upsertEntity(s, 'obligationPayments', pay(s), ctx()).obligationPayments).toHaveLength(1)
      expect(upsertEntity(s, 'obligationPayments', pay(s, { status: 'skipped', amount: 0 }), ctx()).obligationPayments).toHaveLength(1)
    })

    it('rejects duplicates, out-of-range periods, pre-tracking instances and bad skip amounts', () => {
      const s = setUp()
      const once = upsertEntity(s, 'obligationPayments', pay(s), ctx())
      expect(code(() => upsertEntity(once, 'obligationPayments', pay(once), ctx()))).toBe('DUPLICATE')
      expect(code(() => upsertEntity(s, 'obligationPayments', pay(s, { period: '2026-09' }), ctx()))).toBe('OUT_OF_RANGE')
      expect(code(() => upsertEntity(s, 'obligationPayments', pay(s, { status: 'skipped', amount: 5 }), ctx()))).toBe('INVALID')
      expect(code(() => upsertEntity(s, 'obligationPayments', pay(s, { amount: 0 }), ctx()))).toBe('INVALID')
      const early = { ...s, obligations: s.obligations.map((o) => ({ ...o, dueDay: 5 })) }
      expect(code(() => upsertEntity(early, 'obligationPayments', pay(early), ctx()))).toBe('BEFORE_TRACKING')
    })

    it('blocks editing a bill so that a payment falls outside its months', () => {
      const base = setUp()
      const withPay = upsertEntity(base, 'obligationPayments', pay(base), ctx())
      const o = withPay.obligations[0]!
      expect(code(() => upsertEntity(withPay, 'obligations', { ...o, startMonth: '2026-11' }, ctx()))).toBe('PAYMENTS_OUTSIDE_RANGE')
    })
  })

  it('confirmed days are unique per date (idempotent)', () => {
    const s = setUp()
    const a = upsertEntity(s, 'confirmedDays', { id: randomUUID(), date: '2026-10-13' }, ctx())
    const b = upsertEntity(a, 'confirmedDays', { id: randomUUID(), date: '2026-10-13' }, ctx())
    expect(b.confirmedDays).toHaveLength(1)
  })
})

describe('entity delete rules', () => {
  it('blocks deleting categories in use and bills with history; cascades goals', () => {
    const s = setUp()
    const cat = expenseCat(s)
    const withTx = upsertEntity(s, 'transactions', { id: randomUUID(), date: '2026-10-13', amount: 100, kind: 'daily', categoryId: cat }, ctx())
    expect(code(() => deleteEntity(withTx, 'categories', cat))).toBe('IN_USE')

    const paid = upsertEntity(s, 'obligationPayments', {
      id: randomUUID(), obligationId: s.obligations[0]!.id, period: '2026-10', status: 'paid', date: '2026-10-13', amount: 8000
    }, ctx())
    expect(code(() => deleteEntity(paid, 'obligations', s.obligations[0]!.id))).toBe('IN_USE')
    expect(deleteEntity(s, 'obligations', s.obligations[0]!.id).obligations).toHaveLength(0)

    const gid = randomUUID()
    let g = upsertEntity(s, 'goals', { id: gid, name: 'Car', targetAmount: 100000, archived: false }, ctx())
    g = upsertEntity(g, 'goalContributions', { id: randomUUID(), goalId: gid, date: '2026-10-13', amount: 500 }, ctx())
    const after = deleteEntity(g, 'goals', gid)
    expect(after.goals).toHaveLength(0)
    expect(after.goalContributions).toHaveLength(0)
  })

  it('keeps at least one active category of each kind', () => {
    const s = setUp()
    const incomes = s.categories.filter((c) => c.kind === 'income')
    const one = deleteEntity(s, 'categories', incomes[0]!.id)
    expect(code(() => deleteEntity(one, 'categories', incomes[1]!.id))).toBe('LAST_CATEGORY')
    expect(code(() => upsertEntity(one, 'categories', { ...incomes[1]!, archived: true }, ctx()))).toBe('LAST_CATEGORY')
  })
})

describe('settings and cycles', () => {
  it('validates the settings patch strictly', () => {
    const s = setUp()
    expect(updateSettings(s, { payday: 1 }, ctx()).settings.payday).toBe(1)
    expect(code(() => updateSettings(s, { setupComplete: false }, ctx()))).toBe('INVALID')
    expect(code(() => updateSettings(s, { currency: 'KWD' }, ctx()))).toBe('INVALID')
  })

  it('balance anchor: valid, future date rejected, null clears, unknown nested key rejected (docs/05 §10)', () => {
    const s = setUp()
    const anchored = updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: -150000 } }, ctx())
    expect(anchored.settings.balanceAnchor).toEqual({ date: '2026-10-13', amount: -150000 })
    expect(updateSettings(anchored, { payday: 5 }, ctx()).settings.balanceAnchor).toEqual({ date: '2026-10-13', amount: -150000 })
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-14', amount: 100 } }, ctx()))).toBe('FUTURE_DATE')
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: 10.5 } }, ctx()))).toBe('INVALID')
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: 100, evil: 1 } }, ctx()))).toBe('INVALID')
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-13' } }, ctx()))).toBe('INVALID')
    // The anchor is bounded like every stored amount; the UI surfaces this error rather than clamping.
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: MAX_AMOUNT + 1 } }, ctx()))).toBe('INVALID')
    expect(code(() => updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: -MAX_AMOUNT - 1 } }, ctx()))).toBe('INVALID')
    expect(updateSettings(s, { balanceAnchor: { date: '2026-10-13', amount: -MAX_AMOUNT } }, ctx()).settings.balanceAnchor?.amount).toBe(-MAX_AMOUNT)
    const cleared = updateSettings(anchored, { balanceAnchor: null }, ctx())
    expect(cleared.settings.balanceAnchor).toBeUndefined()
    expect('balanceAnchor' in cleared.settings).toBe(false)
    expect('state' in integrityError(anchored)).toBe(true)
    expect('state' in integrityError(cleared)).toBe(true)
  })

  it('changes the allowance of the current cycle only (QA B5)', () => {
    const s = completeSetup(emptyState(randomUUID), {
      currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: '2026-09-20', obligations: []
    }, ctx('2026-10-13'))
    const next = setAllowance(s, 5000, ctx('2026-10-13'))
    expect(next.cycles.map((c) => c.dailyAllowance)).toEqual([7000, 5000])
    expect(code(() => setAllowance(s, -1, ctx()))).toBe('INVALID')
  })

  it('rollCycles appends cycles after a payday passes', () => {
    const s = setUp()
    const { state, added } = rollCycles(s, ctx('2026-11-30'))
    expect(added).toBe(2)
    expect(state.cycles.at(-1)).toMatchObject({ startDate: '2026-11-27', endDate: '2026-12-26' })
  })
})

describe('whole-file integrity (imports)', () => {
  it('accepts a valid state and rejects dangling references and overlapping cycles', () => {
    const s = setUp()
    expect('state' in integrityError(s)).toBe(true)
    const bad = { ...s, transactions: [{ id: randomUUID(), date: '2026-10-13', amount: 1, kind: 'daily', categoryId: randomUUID(), createdAt: '2026-10-13T00:00:00Z' }] }
    expect(integrityError(bad)).toMatchObject({ error: expect.stringMatching(/missing category/) })
    const overlap = { ...s, cycles: [...s.cycles, { ...s.cycles[0]!, id: randomUUID() }] }
    expect('error' in integrityError(overlap)).toBe(true)
    expect('error' in integrityError({ ...s, __proto__: { polluted: true }, extra: 1 })).toBe(true)
  })

  it('accepts future-dated items when loading (QA B7)', () => {
    const s = setUp()
    s.transactions.push({ id: randomUUID(), date: '2099-01-01', amount: 100, kind: 'daily', categoryId: expenseCat(s), createdAt: '2026-10-13T00:00:00Z' })
    expect('state' in integrityError(s)).toBe(true)
  })
})

describe('extend tracking back (docs/05 §3)', () => {
  const payload = { startDate: '2026-09-01', dailyAllowance: 5000, confirmDays: true }

  it('prepends contiguous cycles, keeps existing cycles identical and confirms only empty past days', () => {
    let s = setUp('2026-10-13')
    s = upsertEntity(s, 'transactions', { id: randomUUID(), date: '2026-09-10', amount: 1000, kind: 'daily', categoryId: expenseCat(s) }, ctx())
    s = upsertEntity(s, 'transactions', { id: randomUUID(), date: '2026-09-12', amount: 1000, kind: 'nonDaily', categoryId: expenseCat(s) }, ctx())
    s = upsertEntity(s, 'confirmedDays', { id: randomUUID(), date: '2026-09-11' }, ctx())
    const next = extendBack(s, payload, ctx('2026-10-13'))
    expect(next.cycles.map((c) => [c.startDate, c.endDate, c.dailyAllowance])).toEqual([
      ['2026-09-01', '2026-09-26', 5000],
      ['2026-09-27', '2026-10-12', 5000],
      ['2026-10-13', '2026-10-26', 7000]
    ])
    expect(next.cycles[2]).toEqual(s.cycles[0])
    expect('state' in integrityError(next)).toBe(true)
    // 42 days (1 Sep–12 Oct) minus the day with a daily entry and the already-confirmed day, plus that existing one.
    const dates = next.confirmedDays.map((c) => c.date).sort()
    expect(dates).toHaveLength(41)
    expect(dates[0]).toBe('2026-09-01')
    expect(dates.at(-1)).toBe('2026-10-12')
    expect(dates).not.toContain('2026-09-10')
    expect(dates.filter((d) => d === '2026-09-11')).toHaveLength(1)
    expect(dates).toContain('2026-09-12')
    expect(new Set(next.confirmedDays.map((c) => c.id)).size).toBe(41)
    expect(next.transactions).toEqual(s.transactions)
  })

  it('without confirmDays no confirmed days are created', () => {
    const next = extendBack(setUp('2026-10-13'), { ...payload, confirmDays: false }, ctx('2026-10-13'))
    expect(next.cycles).toHaveLength(3)
    expect(next.confirmedDays).toEqual([])
  })

  it('a start after today (clock rolled back) is FUTURE_DATE, like every other date rule (docs/05 §2)', () => {
    const s = setUp('2026-10-13')
    expect(code(() => extendBack(s, { ...payload, startDate: '2026-10-05' }, ctx('2026-10-01')))).toBe('FUTURE_DATE')
    const next = extendBack(s, { ...payload, startDate: '2026-10-01', confirmDays: false }, ctx('2026-10-01'))
    expect(next.cycles.map((c) => c.startDate)).toEqual(['2026-10-01', '2026-10-13'])
  })

  it('confirmDays with the clock rolled back confirms only days before today (docs/05 §3: d < min(first.startDate, today))', () => {
    const s = setUp('2026-10-13')
    const next = extendBack(s, { ...payload, startDate: '2026-09-20' }, ctx('2026-10-01'))
    const dates = next.confirmedDays.map((c) => c.date).sort()
    expect(dates).toHaveLength(11)
    expect(dates[0]).toBe('2026-09-20')
    expect(dates.at(-1)).toBe('2026-09-30')
    expect(dates).not.toContain('2026-10-01')
    expect('state' in integrityError(next)).toBe(true)
  })

  it('skipPastBills marks unsettled bill months due in the extended range before today as skipped (docs/05 §3)', () => {
    const s = setUp('2026-10-13') // Phone, due on the 25th
    const phone = s.obligations[0]!
    s.obligations = [{ ...phone, startMonth: '2026-06' }]
    s.obligationPayments.push({
      id: randomUUID(), obligationId: phone.id, period: '2026-08', status: 'paid', date: '2026-08-25', amount: 8000, createdAt: '2026-08-25T00:00:00.000Z'
    })
    const next = extendBack(s, { ...payload, startDate: '2026-07-01', skipPastBills: true }, ctx('2026-10-13'))
    // Due in [1 Jul, 12 Oct]: July, August and September. August is already settled; October is due after the range.
    const skips = next.obligationPayments.filter((x) => x.status === 'skipped')
    expect(skips.map((x) => x.period)).toEqual(['2026-07', '2026-09'])
    expect(skips[0]).toMatchObject({ obligationId: phone.id, amount: 0, date: '2026-10-13', createdAt: '2026-10-13T10:00:00.000Z' })
    expect(next.obligationPayments).toHaveLength(3)
    expect('state' in integrityError(next)).toBe(true)
    const pot = computePot(next, '2026-10-13')
    expect(pot.settlements.get(`${phone.id}:2026-09`)?.status).toBe('skipped')
    expect(pot.instances.filter((i) => !pot.settlements.has(i.key)).map((i) => i.period)).toEqual(['2026-10'])
    // Omitted or false: nothing is settled, so the exposed months show as overdue and are reserved.
    expect(extendBack(s, { ...payload, startDate: '2026-07-01' }, ctx('2026-10-13')).obligationPayments).toEqual(s.obligationPayments)
    expect(extendBack(s, { ...payload, startDate: '2026-07-01', skipPastBills: false }, ctx('2026-10-13')).obligationPayments).toEqual(s.obligationPayments)
    // Clock rolled back: a month due inside the range but not before today is left alone.
    const early = setUp('2026-10-13')
    early.obligations = [{ ...early.obligations[0]!, dueDay: 5, startMonth: '2026-06' }]
    const skipped = extendBack(early, { ...payload, startDate: '2026-09-01', skipPastBills: true }, ctx('2026-10-01')).obligationPayments
    expect(skipped.map((x) => x.period)).toEqual(['2026-09'])
    // A settlement row dated after today (clock rolled back, or an imported file) still occupies its month:
    // re-skipping it would settle the month twice, which the integrity check forbids.
    const future = setUp('2026-10-13')
    future.obligations = [{ ...future.obligations[0]!, startMonth: '2026-06' }]
    future.obligationPayments.push({
      id: randomUUID(), obligationId: future.obligations[0]!.id, period: '2026-08', status: 'paid', date: '2026-11-01', amount: 8000, createdAt: '2026-11-01T00:00:00.000Z'
    })
    const withFuture = extendBack(future, { ...payload, startDate: '2026-07-01', skipPastBills: true }, ctx('2026-10-13'))
    expect(withFuture.obligationPayments.filter((x) => x.status === 'skipped').map((x) => x.period)).toEqual(['2026-07', '2026-09'])
    expect('state' in integrityError(withFuture)).toBe(true)
  })

  it('rejects unknown keys, bad values, a start not before the first day, too far back, and before setup', () => {
    const s = setUp('2026-10-13')
    expect(code(() => extendBack(s, { ...payload, evil: 1 }, ctx()))).toBe('INVALID')
    expect(code(() => extendBack(s, { ...payload, dailyAllowance: -1 }, ctx()))).toBe('INVALID')
    expect(code(() => extendBack(s, { startDate: '2026-09-01', dailyAllowance: 5000 }, ctx()))).toBe('INVALID')
    expect(code(() => extendBack(s, { ...payload, startDate: '2026-10-13' }, ctx()))).toBe('INVALID')
    expect(code(() => extendBack(s, { ...payload, startDate: '2026-10-20' }, ctx()))).toBe('FUTURE_DATE') // after today, so the date rule wins
    expect(code(() => extendBack(s, { ...payload, startDate: '2023-10-12' }, ctx()))).toBe('INVALID')
    expect(extendBack(s, { ...payload, startDate: '2023-10-13', confirmDays: false }, ctx()).cycles[0]!.startDate).toBe('2023-10-13')
    expect(code(() => extendBack(emptyState(randomUUID), payload, ctx()))).toBe('NOT_SET_UP')
  })
})
