/**
 * Single source of truth for stored data shapes (DEVELOPMENT-FRAMEWORK §2).
 * These are the *load* schemas: structural rules only. Write-time rules that
 * depend on "today" or on other records live in src/main/commands.ts (docs/05 §2, §9).
 */
import { z } from 'zod'
import { isValidDate, isValidMonth } from './dates'
import { CURRENCIES, MAX_AMOUNT } from './money'

/** Bumped on every data-shape change (DEVELOPMENT-FRAMEWORK §3). v2 added the optional settings.balanceAnchor (docs/05 §10). */
export const SCHEMA_VERSION = 2

export const zId = z.uuid()
export const zDate = z.string().refine(isValidDate, 'Invalid date')
export const zMonth = z.string().refine(isValidMonth, 'Invalid month')
const zMinor = z.number().int().min(0).max(MAX_AMOUNT)
const zPositive = z.number().int().min(1).max(MAX_AMOUNT)
const zNote = z.string().max(200).optional()
const zName = z.string().trim().min(1).max(40)
const zTimestamp = z.string().min(10).max(40)

/**
 * "At the START of `date` (before that day's flows) my main cash balance was `amount`."
 * The main balance is derived from this anchor plus the flows since (docs/05 §10, ADR-0007).
 */
export const zBalanceAnchor = z.strictObject({ date: zDate, amount: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT) })

export const zSettings = z.strictObject({
  currency: z.enum(CURRENCIES),
  payday: z.number().int().min(1).max(31),
  theme: z.enum(['system', 'light', 'dark']),
  autoLockMinutes: z.number().int().min(0).max(240),
  setupComplete: z.boolean(),
  lastExportAt: zTimestamp.optional(),
  balanceAnchor: zBalanceAnchor.optional()
})

export const zCategory = z.strictObject({
  id: zId,
  name: zName,
  kind: z.enum(['expense', 'income']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  archived: z.boolean()
})

export const zCycle = z.strictObject({
  id: zId,
  startDate: zDate,
  endDate: zDate,
  dailyAllowance: zMinor
})

export const zTransaction = z.strictObject({
  id: zId,
  date: zDate,
  amount: zPositive,
  kind: z.enum(['daily', 'nonDaily', 'income']),
  categoryId: zId,
  note: zNote,
  createdAt: zTimestamp
})

export const zObligation = z
  .strictObject({
    id: zId,
    name: zName,
    amount: zPositive,
    dueDay: z.number().int().min(1).max(31),
    categoryId: zId.optional(),
    startMonth: zMonth,
    endMonth: zMonth.optional(),
    note: zNote
  })
  .refine((o) => !o.endMonth || o.endMonth >= o.startMonth, { message: 'End month is before start month', path: ['endMonth'] })

export const zObligationPayment = z
  .strictObject({
    id: zId,
    obligationId: zId,
    period: zMonth,
    status: z.enum(['paid', 'skipped']),
    date: zDate,
    amount: zMinor,
    note: zNote,
    createdAt: zTimestamp
  })
  .refine((p) => (p.status === 'paid' ? p.amount > 0 : p.amount === 0), {
    message: 'Paid needs an amount above 0; skipped must be 0',
    path: ['amount']
  })

export const zGoal = z.strictObject({
  id: zId,
  name: zName,
  targetAmount: zPositive,
  targetDate: zDate.optional(),
  archived: z.boolean(),
  createdAt: zTimestamp
})

export const zGoalContribution = z.strictObject({
  id: zId,
  goalId: zId,
  date: zDate,
  amount: z
    .number()
    .int()
    .min(-MAX_AMOUNT)
    .max(MAX_AMOUNT)
    .refine((n) => n !== 0, 'Amount cannot be 0'),
  note: zNote
})

export const zHolding = z.strictObject({
  id: zId,
  name: zName,
  symbol: z.string().trim().max(12).optional(),
  note: zNote,
  archived: z.boolean()
})

export const zHoldingTransaction = z.strictObject({
  id: zId,
  holdingId: zId,
  date: zDate,
  kind: z.enum(['buy', 'sell']),
  amount: zPositive,
  quantity: z.number().positive().max(1e12).optional(),
  note: zNote
})

export const zHoldingValuation = z.strictObject({
  id: zId,
  holdingId: zId,
  date: zDate,
  value: zMinor
})

export const zConfirmedDay = z.strictObject({ id: zId, date: zDate })

export const zAppState = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  settings: zSettings,
  categories: z.array(zCategory),
  cycles: z.array(zCycle),
  transactions: z.array(zTransaction),
  obligations: z.array(zObligation),
  obligationPayments: z.array(zObligationPayment),
  goals: z.array(zGoal),
  goalContributions: z.array(zGoalContribution),
  holdings: z.array(zHolding),
  holdingTransactions: z.array(zHoldingTransaction),
  holdingValuations: z.array(zHoldingValuation),
  confirmedDays: z.array(zConfirmedDay)
})

export type BalanceAnchor = z.infer<typeof zBalanceAnchor>
export type Settings = z.infer<typeof zSettings>
export type Category = z.infer<typeof zCategory>
export type Cycle = z.infer<typeof zCycle>
export type Transaction = z.infer<typeof zTransaction>
export type Obligation = z.infer<typeof zObligation>
export type ObligationPayment = z.infer<typeof zObligationPayment>
export type Goal = z.infer<typeof zGoal>
export type GoalContribution = z.infer<typeof zGoalContribution>
export type Holding = z.infer<typeof zHolding>
export type HoldingTransaction = z.infer<typeof zHoldingTransaction>
export type HoldingValuation = z.infer<typeof zHoldingValuation>
export type ConfirmedDay = z.infer<typeof zConfirmedDay>
export type AppState = z.infer<typeof zAppState>

/** Collections the renderer may upsert/delete (docs/05 §2 allowlist). */
export const ENTITY_SCHEMAS = {
  categories: zCategory,
  transactions: zTransaction,
  obligations: zObligation,
  obligationPayments: zObligationPayment,
  goals: zGoal,
  goalContributions: zGoalContribution,
  holdings: zHolding,
  holdingTransactions: zHoldingTransaction,
  holdingValuations: zHoldingValuation,
  confirmedDays: zConfirmedDay
} as const

export type EntityCollection = keyof typeof ENTITY_SCHEMAS
export const ENTITY_COLLECTIONS = Object.keys(ENTITY_SCHEMAS) as EntityCollection[]
export type EntityOf<C extends EntityCollection> = z.infer<(typeof ENTITY_SCHEMAS)[C]>

/** Fields main sets itself; the renderer may omit them on upsert. */
export const SERVER_TIMESTAMP_COLLECTIONS: readonly EntityCollection[] = ['transactions', 'obligationPayments', 'goals']

const DEFAULT_CATEGORIES: Array<Omit<Category, 'id'>> = [
  { name: 'Food & dining', kind: 'expense', color: '#e07a5f', archived: false },
  { name: 'Groceries', kind: 'expense', color: '#81b29a', archived: false },
  { name: 'Coffee', kind: 'expense', color: '#a26769', archived: false },
  { name: 'Transport & fuel', kind: 'expense', color: '#3d85c6', archived: false },
  { name: 'Shopping', kind: 'expense', color: '#c27ba0', archived: false },
  { name: 'Entertainment', kind: 'expense', color: '#f2cc8f', archived: false },
  { name: 'Health', kind: 'expense', color: '#6aa84f', archived: false },
  { name: 'Bills & subscriptions', kind: 'expense', color: '#8e7cc3', archived: false },
  { name: 'Other', kind: 'expense', color: '#999999', archived: false },
  { name: 'Salary', kind: 'income', color: '#2e8b57', archived: false },
  { name: 'Other income', kind: 'income', color: '#5f9ea0', archived: false }
]

export function emptyState(newId: () => string): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { currency: 'SAR', payday: 27, theme: 'system', autoLockMinutes: 0, setupComplete: false },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, id: newId() })),
    cycles: [],
    transactions: [],
    obligations: [],
    obligationPayments: [],
    goals: [],
    goalContributions: [],
    holdings: [],
    holdingTransactions: [],
    holdingValuations: [],
    confirmedDays: []
  }
}
