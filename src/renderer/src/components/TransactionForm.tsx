/** Quick add (dashboard) and edit form for transactions. */
import { useMemo, useRef, useState } from 'react'
import type { Transaction } from '@shared/schema'
import { Field, MoneyInput, useMoneyField } from './ui'
import { newId, useReady } from '../state/app'

type Kind = Transaction['kind']
const KINDS: Array<{ k: Kind; label: string }> = [
  { k: 'daily', label: 'Daily' },
  { k: 'nonDaily', label: 'Non-daily' },
  { k: 'income', label: 'Income' }
]

const LAST_CAT_KEY = 'dailypot:lastCategory'
function lastCategory(kind: Kind): string | null {
  try {
    return (JSON.parse(localStorage.getItem(LAST_CAT_KEY) ?? '{}') as Record<string, string>)[kind] ?? null
  } catch {
    return null
  }
}
function rememberCategory(kind: Kind, id: string): void {
  try {
    const m = JSON.parse(localStorage.getItem(LAST_CAT_KEY) ?? '{}') as Record<string, string>
    localStorage.setItem(LAST_CAT_KEY, JSON.stringify({ ...m, [kind]: id }))
  } catch {
    /* convenience only */
  }
}

export function TransactionForm({
  existing,
  onDone,
  compact
}: {
  existing?: Transaction
  onDone?: () => void
  compact?: boolean
}): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [kind, setKind] = useState<Kind>(existing?.kind ?? 'daily')
  const amount = useMoneyField(existing?.amount)
  const [note, setNote] = useState(existing?.note ?? '')
  // null = "today", so a form left open past midnight follows the new day (QA P2-1).
  const [pickedDate, setDate] = useState<string | null>(existing?.date ?? null)
  const date = pickedDate ?? derived.today
  const wantKind = kind === 'income' ? 'income' : 'expense'
  const options = useMemo(
    () => state.categories.filter((c) => c.kind === wantKind && (!c.archived || c.id === existing?.categoryId)),
    [state.categories, wantKind, existing?.categoryId]
  )
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? lastCategory('daily') ?? '')
  // Keep the chosen category if it fits this kind; otherwise the last one used for this kind, else the first.
  const effectiveCat = options.some((o) => o.id === categoryId)
    ? categoryId
    : (options.find((o) => o.id === lastCategory(kind))?.id ?? options[0]?.id ?? '')
  const amountRef = useRef<HTMLDivElement>(null)

  const valid = amount.value !== null && amount.value > 0 && !!effectiveCat && date <= derived.today
  const save = async (): Promise<void> => {
    if (!valid) return
    const item = {
      id: existing?.id ?? newId(),
      date,
      amount: amount.value!,
      kind,
      categoryId: effectiveCat,
      ...(note.trim() ? { note: note.trim() } : {})
    }
    const ok = await run(window.dailypot.upsert('transactions', item), existing ? 'Saved' : undefined)
    if (ok) {
      rememberCategory(kind, effectiveCat)
      if (!existing) {
        amount.reset()
        setNote('')
        setDate(null)
        amountRef.current?.querySelector('input')?.focus()
      }
      onDone?.()
    }
  }

  const kindToggle = (
    <div className="seg" role="group" aria-label="Kind">
      {KINDS.map(({ k, label }) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="row-between">
        {kindToggle}
        {kind === 'nonDaily' ? <span className="faint">One-off: paid from your main balance, doesn’t touch the per-day or pot</span> : null}
        {kind === 'income' ? <span className="faint">Income doesn’t affect the pot</span> : null}
      </div>
      <div className={compact ? 'quick-add' : 'grid grid-2'}>
        <div ref={amountRef}>
          <MoneyInput field={amount} label={`Amount (${derived.currency})`} autoFocus />
        </div>
        <Field label="Category">
          <select className="input" value={effectiveCat} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. lunch" />
        </Field>
        {compact ? (
          <button className="btn primary" disabled={!valid}>
            Add
          </button>
        ) : (
          <Field label="Date">
            <input className="input" type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
      </div>
      {compact ? (
        <div className="row">
          <label className="row faint">
            Date
            <input className="input" style={{ width: 160 }} type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <span className="faint">Press Enter to add</span>
        </div>
      ) : (
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      )}
    </form>
  )
}
