/** Test helpers for building AppState fixtures (imported by *.test.ts only). */
import { randomUUID } from 'node:crypto'
import { emptyState, type AppState, type Cycle, type Obligation, type ObligationPayment, type Transaction } from '../schema'

export const id = (): string => randomUUID()
export const sar = (n: number): number => Math.round(n * 100)

export function baseState(cycles: Array<Pick<Cycle, 'startDate' | 'endDate'> & { allowance: number }>): AppState {
  const s = emptyState(id)
  s.settings.setupComplete = true
  s.cycles = cycles.map((c) => ({ id: id(), startDate: c.startDate, endDate: c.endDate, dailyAllowance: sar(c.allowance) }))
  return s
}

export function expenseCategory(s: AppState): string {
  return s.categories.find((c) => c.kind === 'expense')!.id
}

export function spend(s: AppState, date: string, amount: number, kind: Transaction['kind'] = 'daily'): Transaction {
  const cat = kind === 'income' ? s.categories.find((c) => c.kind === 'income')!.id : expenseCategory(s)
  const t: Transaction = { id: id(), date, amount: sar(amount), kind, categoryId: cat, createdAt: new Date().toISOString() }
  s.transactions.push(t)
  return t
}

export function bill(s: AppState, name: string, amount: number, dueDay: number, startMonth: string, endMonth?: string): Obligation {
  const o: Obligation = { id: id(), name, amount: sar(amount), dueDay, startMonth, ...(endMonth ? { endMonth } : {}) }
  s.obligations.push(o)
  return o
}

export function pay(s: AppState, o: Obligation, period: string, date: string, amount?: number): ObligationPayment {
  const p: ObligationPayment = {
    id: id(),
    obligationId: o.id,
    period,
    status: 'paid',
    date,
    amount: amount === undefined ? o.amount : sar(amount),
    createdAt: new Date().toISOString()
  }
  s.obligationPayments.push(p)
  return p
}

export function skip(s: AppState, o: Obligation, period: string, date: string): ObligationPayment {
  const p: ObligationPayment = { id: id(), obligationId: o.id, period, status: 'skipped', date, amount: 0, createdAt: new Date().toISOString() }
  s.obligationPayments.push(p)
  return p
}
