/** CSV export of transactions (SECURITY §4, threat T12). */
import { toDecimalString } from '@shared/money'
import type { AppState } from '@shared/schema'

const KIND_LABEL = { daily: 'Daily', nonDaily: 'Non-daily', income: 'Income' } as const

/** Quote a text cell and neutralise spreadsheet formula prefixes. */
export function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function transactionsCsv(state: AppState, ids?: readonly string[]): string {
  const wanted = ids && ids.length > 0 ? new Set(ids) : null
  const cats = new Map(state.categories.map((c) => [c.id, c.name]))
  const rows = state.transactions
    .filter((t) => !wanted || wanted.has(t.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) =>
      [
        t.date,
        textCell(KIND_LABEL[t.kind]),
        textCell(cats.get(t.categoryId) ?? ''),
        toDecimalString(t.amount),
        textCell(state.settings.currency),
        textCell(t.note ?? '')
      ].join(',')
    )
  return '﻿' + ['Date,Kind,Category,Amount,Currency,Note', ...rows].join('\r\n') + '\r\n'
}
