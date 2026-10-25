/**
 * Pure write commands: (state, input, today) → new state, or throw CommandError.
 * All write-time rules from docs/05 §2 live here so they are unit-testable without Electron.
 */
import { addDays, monthOf, type ISODate } from '@shared/dates'
import {
  computePot,
  cycleEndFor,
  defaultStartMonth,
  dueDateOf,
  ensureCycles,
  extendCyclesBack,
  findCycle,
  pastBillsToSkip,
  sortCycles,
  startNextEarly as startEarlyEngine,
  unloggedDays,
  validateExtendBack,
  validateFirstCycleStart
} from '@shared/engine'
import { zExtendBackPayload, zSettingsPatch, zSetupPayload } from '@shared/ipc'
import { MAX_AMOUNT } from '@shared/money'
import {
  ENTITY_COLLECTIONS,
  ENTITY_SCHEMAS,
  SERVER_TIMESTAMP_COLLECTIONS,
  emptyState,
  zAppState,
  zId,
  type AppState,
  type EntityCollection
} from '@shared/schema'
import { z } from 'zod'

export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const fail = (code: string, message: string): never => {
  throw new CommandError(code, message)
}

export interface Ctx {
  today: ISODate
  nowIso: string
  newId: () => string
}

function firstCycleStart(state: AppState): ISODate | undefined {
  return sortCycles(state.cycles)[0]?.startDate
}

function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0]
  if (!issue) return 'Invalid input'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

function notFuture(date: string, ctx: Ctx, what: string): void {
  if (date > ctx.today) fail('FUTURE_DATE', `${what} cannot be in the future`)
}

function requireSetup(state: AppState): void {
  if (!state.settings.setupComplete) fail('NOT_SET_UP', 'Finish setup first')
}

// ---------- entity upsert ----------

export function upsertEntity(state: AppState, collection: unknown, rawItem: unknown, ctx: Ctx): AppState {
  if (typeof collection !== 'string' || !(ENTITY_COLLECTIONS as string[]).includes(collection)) {
    fail('BAD_COLLECTION', 'Unknown collection')
  }
  requireSetup(state)
  const col = collection as EntityCollection
  const list = state[col] as Array<{ id: string } & Record<string, unknown>>

  if (typeof rawItem !== 'object' || rawItem === null || Array.isArray(rawItem)) fail('INVALID', 'Item must be an object')
  const input = { ...(rawItem as Record<string, unknown>) }
  const existing = typeof input.id === 'string' ? list.find((x) => x.id === input.id) : undefined
  if (SERVER_TIMESTAMP_COLLECTIONS.includes(col)) input.createdAt = existing?.createdAt ?? ctx.nowIso

  const parsed = ENTITY_SCHEMAS[col].safeParse(input)
  if (!parsed.success) fail('INVALID', zodMessage(parsed.error))
  const item = parsed.data as { id: string } & Record<string, unknown>

  const next: AppState = { ...state }
  switch (col) {
    case 'categories':
      checkCategory(state, item as AppState['categories'][number], existing as AppState['categories'][number] | undefined)
      break
    case 'transactions':
      checkTransaction(state, item as AppState['transactions'][number], ctx)
      break
    case 'obligations':
      checkObligation(state, item as AppState['obligations'][number])
      break
    case 'obligationPayments':
      checkPayment(state, item as AppState['obligationPayments'][number], ctx)
      break
    case 'goals':
      break
    case 'goalContributions': {
      const c = item as AppState['goalContributions'][number]
      if (!state.goals.some((g) => g.id === c.goalId)) fail('NOT_FOUND', 'Goal not found')
      notFuture(c.date, ctx, 'Date')
      break
    }
    case 'holdings':
      break
    case 'holdingTransactions':
    case 'holdingValuations': {
      const h = item as unknown as { holdingId: string; date: string }
      if (!state.holdings.some((x) => x.id === h.holdingId)) fail('NOT_FOUND', 'Holding not found')
      notFuture(h.date, ctx, 'Date')
      break
    }
    case 'confirmedDays': {
      const d = item as AppState['confirmedDays'][number]
      notFuture(d.date, ctx, 'Date')
      if (state.confirmedDays.some((x) => x.date === d.date && x.id !== d.id)) return state
      break
    }
  }

  const replaced = existing ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
  ;(next as Record<string, unknown>)[col] = replaced
  return next
}

function checkCategory(state: AppState, c: AppState['categories'][number], existing?: AppState['categories'][number]): void {
  if (existing && existing.kind !== c.kind && categoryInUse(state, c.id)) {
    fail('IN_USE', 'A category in use cannot change between expense and income')
  }
  if (c.archived) {
    const others = state.categories.filter((x) => x.id !== c.id && x.kind === c.kind && !x.archived)
    if (others.length === 0) fail('LAST_CATEGORY', `Keep at least one active ${c.kind} category`)
  }
}

function categoryInUse(state: AppState, id: string): boolean {
  return state.transactions.some((t) => t.categoryId === id) || state.obligations.some((o) => o.categoryId === id)
}

function checkTransaction(state: AppState, t: AppState['transactions'][number], ctx: Ctx): void {
  notFuture(t.date, ctx, 'Date')
  const cat = state.categories.find((c) => c.id === t.categoryId)
  if (!cat) fail('NOT_FOUND', 'Category not found')
  const want = t.kind === 'income' ? 'income' : 'expense'
  if (cat!.kind !== want) fail('CATEGORY_KIND', `Use an ${want} category for this entry`)
}

function checkObligation(state: AppState, o: AppState['obligations'][number]): void {
  if (o.categoryId) {
    const cat = state.categories.find((c) => c.id === o.categoryId)
    if (!cat || cat.kind !== 'expense') fail('CATEGORY_KIND', 'Bills need an expense category')
  }
  const outside = state.obligationPayments.some(
    (p) => p.obligationId === o.id && (p.period < o.startMonth || (o.endMonth !== undefined && p.period > o.endMonth))
  )
  if (outside) fail('PAYMENTS_OUTSIDE_RANGE', 'This bill has payments outside the new start/end months')
}

function checkPayment(state: AppState, p: AppState['obligationPayments'][number], ctx: Ctx): void {
  const o = state.obligations.find((x) => x.id === p.obligationId)
  if (!o) fail('NOT_FOUND', 'Bill not found')
  const ob = o!
  if (p.period < ob.startMonth || (ob.endMonth !== undefined && p.period > ob.endMonth)) {
    fail('OUT_OF_RANGE', 'That month is outside this bill’s start/end months')
  }
  notFuture(p.date, ctx, 'Payment date')
  const first = firstCycleStart(state)
  if (!first) fail('NOT_SET_UP', 'No budget cycle yet')
  if (dueDateOf(ob, p.period) < first!) fail('BEFORE_TRACKING', 'That bill was due before you started tracking')
  if (p.date < first!) fail('BEFORE_TRACKING', 'Payment date is before you started tracking')
  const dup = state.obligationPayments.find((x) => x.obligationId === p.obligationId && x.period === p.period && x.id !== p.id)
  if (dup) fail('DUPLICATE', 'This month is already settled; edit or delete that entry instead')
}

// ---------- entity delete ----------

export function deleteEntity(state: AppState, collection: unknown, id: unknown): AppState {
  if (typeof collection !== 'string' || !(ENTITY_COLLECTIONS as string[]).includes(collection)) {
    fail('BAD_COLLECTION', 'Unknown collection')
  }
  const parsedId = zId.safeParse(id)
  if (!parsedId.success) fail('INVALID', 'Invalid id')
  const col = collection as EntityCollection
  const list = state[col] as Array<{ id: string }>
  const target = list.find((x) => x.id === parsedId.data)
  if (!target) return state

  const next: AppState = { ...state, [col]: list.filter((x) => x.id !== parsedId.data) }
  switch (col) {
    case 'categories': {
      const c = target as AppState['categories'][number]
      if (categoryInUse(state, c.id)) fail('IN_USE', 'This category is in use; archive it instead')
      if (!c.archived && !state.categories.some((x) => x.id !== c.id && x.kind === c.kind && !x.archived)) {
        fail('LAST_CATEGORY', `Keep at least one active ${c.kind} category`)
      }
      break
    }
    case 'obligations':
      if (state.obligationPayments.some((p) => p.obligationId === target.id)) {
        fail('IN_USE', 'This bill has payment history; archive it instead')
      }
      break
    case 'goals':
      next.goalContributions = state.goalContributions.filter((c) => c.goalId !== target.id)
      break
    case 'holdings':
      next.holdingTransactions = state.holdingTransactions.filter((t) => t.holdingId !== target.id)
      next.holdingValuations = state.holdingValuations.filter((v) => v.holdingId !== target.id)
      break
    default:
      break
  }
  return next
}

/** endMonth to use when archiving (docs/05 §2): max(current month, latest settled period). */
export function archiveMonthFor(state: AppState, obligationId: string, today: ISODate): string {
  const latest = state.obligationPayments
    .filter((p) => p.obligationId === obligationId)
    .reduce((m, p) => (p.period > m ? p.period : m), monthOf(today))
  return latest
}

// ---------- settings, setup, cycles ----------

/**
 * Patch settings. `balanceAnchor` (docs/05 §10): an object sets the anchor (its date must be ≤ today),
 * `null` clears it, omitted leaves it unchanged.
 */
export function updateSettings(state: AppState, patch: unknown, ctx: Ctx): AppState {
  const parsed = zSettingsPatch.safeParse(patch)
  if (!parsed.success) fail('INVALID', zodMessage(parsed.error))
  const { balanceAnchor, ...rest } = parsed.data!
  const settings = { ...state.settings, ...rest }
  if (balanceAnchor === null) {
    delete settings.balanceAnchor
  } else if (balanceAnchor !== undefined) {
    notFuture(balanceAnchor.date, ctx, 'Balance date')
    settings.balanceAnchor = balanceAnchor
  }
  return { ...state, settings }
}

export function completeSetup(state: AppState, payload: unknown, ctx: Ctx): AppState {
  if (state.settings.setupComplete) fail('ALREADY_SET_UP', 'Setup is already complete')
  const parsed = zSetupPayload.safeParse(payload)
  if (!parsed.success) fail('INVALID', zodMessage(parsed.error))
  const p = parsed.data!
  const err = validateFirstCycleStart(p.firstCycleStart, ctx.today)
  if (err) fail('INVALID', err)

  const billsCategory = state.categories.find((c) => c.kind === 'expense' && c.name === 'Bills & subscriptions' && !c.archived)
  const firstCycle = {
    id: ctx.newId(),
    startDate: p.firstCycleStart,
    endDate: cycleEndFor(p.firstCycleStart, p.payday),
    dailyAllowance: p.dailyAllowance
  }
  const { cycles } = ensureCycles([firstCycle], p.payday, ctx.today, ctx.newId)
  return {
    ...state,
    settings: { ...state.settings, currency: p.currency, payday: p.payday, setupComplete: true },
    cycles,
    obligations: p.obligations.map((o) => ({
      id: ctx.newId(),
      name: o.name,
      amount: o.amount,
      dueDay: o.dueDay,
      ...(billsCategory ? { categoryId: billsCategory.id } : {}),
      startMonth: defaultStartMonth(o.dueDay, p.firstCycleStart)
    }))
  }
}

export function setAllowance(state: AppState, dailyAllowance: unknown, ctx: Ctx): AppState {
  requireSetup(state)
  const parsed = z.number().int().min(0).max(MAX_AMOUNT).safeParse(dailyAllowance)
  if (!parsed.success) fail('INVALID', 'Invalid amount')
  const current = findCycle(state.cycles, ctx.today)
  if (!current) fail('NO_CYCLE', 'No current cycle')
  return { ...state, cycles: state.cycles.map((c) => (c.id === current!.id ? { ...c, dailyAllowance: parsed.data! } : c)) }
}

export function startNextEarly(state: AppState, startDate: unknown, ctx: Ctx): AppState {
  requireSetup(state)
  if (typeof startDate !== 'string') fail('INVALID', 'Invalid date')
  try {
    return { ...state, cycles: startEarlyEngine(state.cycles, state.settings.payday, ctx.today, startDate as string, ctx.newId) }
  } catch (e) {
    return fail('INVALID', (e as Error).message)
  }
}

/**
 * Extend tracking into the past (docs/05 §3): prepend cycles from `startDate` to the day before the
 * current first cycle. Existing cycles are untouched. With `confirmDays`, every new past day that the
 * engine lists as unlogged (docs/05 §5) is confirmed as "spent nothing". With `skipPastBills`, every
 * unsettled bill month due in the new range before today is marked skipped (paid before tracking), so
 * the pot does not reserve for it.
 */
export function extendBack(state: AppState, payload: unknown, ctx: Ctx): AppState {
  requireSetup(state)
  const parsed = zExtendBackPayload.safeParse(payload)
  if (!parsed.success) fail('INVALID', zodMessage(parsed.error))
  const p = parsed.data!
  notFuture(p.startDate, ctx, 'Start date')
  const err = validateExtendBack(state.cycles, p.startDate, ctx.today)
  if (err) fail('INVALID', err)
  const oldFirst = sortCycles(state.cycles)[0]!
  const rangeEnd = addDays(oldFirst.startDate, -1)
  const next: AppState = {
    ...state,
    cycles: extendCyclesBack(state.cycles, state.settings.payday, p.startDate, p.dailyAllowance, ctx.newId)
  }
  if (p.confirmDays) {
    // The engine's own definition of an unlogged day, over the new range only; oldest first.
    const empty = unloggedDays(computePot(next, ctx.today), p.startDate, rangeEnd).reverse()
    next.confirmedDays = [...state.confirmedDays, ...empty.map((d) => ({ id: ctx.newId(), date: d.date }))]
  }
  if (p.skipPastBills) {
    // The engine's single definition of "which months to skip" (shared with the dialog preview).
    const skips = pastBillsToSkip(state.obligations, state.obligationPayments, p.startDate, rangeEnd, ctx.today)
      .map((i) => ({
        id: ctx.newId(),
        obligationId: i.obligationId,
        period: i.period,
        status: 'skipped' as const,
        date: ctx.today,
        amount: 0,
        createdAt: ctx.nowIso
      }))
    next.obligationPayments = [...state.obligationPayments, ...skips]
  }
  return next
}

/** Appends cycles up to today. Returns the same object when nothing changed. */
export function rollCycles(state: AppState, ctx: Ctx): { state: AppState; added: number } {
  if (!state.settings.setupComplete || state.cycles.length === 0) return { state, added: 0 }
  const { cycles, added } = ensureCycles(state.cycles, state.settings.payday, ctx.today, ctx.newId)
  return added === 0 ? { state, added } : { state: { ...state, cycles }, added }
}

// ---------- whole-state integrity (imports, restores) ----------

/** Structural + referential validation for a whole file. Returns an error message or null. */
export function integrityError(raw: unknown): { state: AppState } | { error: string } {
  const parsed = zAppState.safeParse(raw)
  if (!parsed.success) return { error: zodMessage(parsed.error) }
  const s = parsed.data
  const ids = new Set<string>()
  for (const col of [...ENTITY_COLLECTIONS, 'cycles'] as const) {
    for (const x of s[col] as Array<{ id: string }>) {
      if (ids.has(x.id)) return { error: `Duplicate id ${x.id}` }
      ids.add(x.id)
    }
  }
  const cat = new Map(s.categories.map((c) => [c.id, c]))
  for (const t of s.transactions) {
    const c = cat.get(t.categoryId)
    if (!c) return { error: 'A transaction references a missing category' }
    if ((t.kind === 'income') !== (c.kind === 'income')) return { error: 'A transaction uses the wrong category kind' }
  }
  const obs = new Map(s.obligations.map((o) => [o.id, o]))
  const keys = new Set<string>()
  for (const p of s.obligationPayments) {
    const o = obs.get(p.obligationId)
    if (!o) return { error: 'A bill payment references a missing bill' }
    const k = `${p.obligationId}:${p.period}`
    if (keys.has(k)) return { error: 'A bill month is settled twice' }
    keys.add(k)
  }
  for (const o of s.obligations) if (o.categoryId && !cat.has(o.categoryId)) return { error: 'A bill references a missing category' }
  if (s.goalContributions.some((c) => !s.goals.some((g) => g.id === c.goalId))) return { error: 'Orphan goal contribution' }
  const hs = new Set(s.holdings.map((h) => h.id))
  if (s.holdingTransactions.some((t) => !hs.has(t.holdingId)) || s.holdingValuations.some((v) => !hs.has(v.holdingId))) {
    return { error: 'Orphan investment record' }
  }
  const cycles = sortCycles(s.cycles)
  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i]!
    if (c.endDate < c.startDate) return { error: 'A cycle ends before it starts' }
    const next = cycles[i + 1]
    if (next && next.startDate !== addDays(c.endDate, 1)) return { error: 'Cycles must be contiguous' }
  }
  if (s.settings.setupComplete && cycles.length === 0) return { error: 'Set-up data has no cycles' }
  return { state: s }
}

/** What the renderer sees while locked: no records, only the theme (docs/05 §2 authorization). */
export function redacted(s: AppState): AppState {
  return {
    ...emptyState(() => '00000000-0000-4000-8000-000000000000'),
    categories: [],
    settings: { ...emptyState(() => '').settings, theme: s.settings.theme, setupComplete: s.settings.setupComplete }
  }
}

export function summarize(s: AppState): string {
  const dates = s.transactions.map((t) => t.date).sort()
  const range = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : 'no transactions'
  return `${s.transactions.length} transactions (${range}), ${s.obligations.length} bills, ${s.goals.length} goals, ${s.holdings.length} holdings`
}
