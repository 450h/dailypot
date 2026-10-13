import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { emptyState, type AppState } from '@shared/schema'
import { CommandError, completeSetup, deleteEntity, integrityError, rollCycles, setAllowance, upsertEntity, updateSettings, type Ctx } from './commands'

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
    expect(updateSettings(s, { payday: 1 }).settings.payday).toBe(1)
    expect(code(() => updateSettings(s, { setupComplete: false }))).toBe('INVALID')
    expect(code(() => updateSettings(s, { currency: 'KWD' }))).toBe('INVALID')
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
