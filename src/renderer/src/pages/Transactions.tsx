/** F3 — Transactions list with filters, edit, delete + undo, CSV export. */
import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatDate, weekdayShort } from '@shared/dates'
import type { Transaction } from '@shared/schema'
import { TransactionForm } from '../components/TransactionForm'
import { Empty, Field, Modal, Money, UserText } from '../components/ui'
import { useReady } from '../state/app'

const KIND_LABEL: Record<Transaction['kind'], string> = { daily: 'Daily', nonDaily: 'Non-daily', income: 'Income' }

export function Transactions(): React.JSX.Element {
  const { state, derived, run, toast } = useReady()
  const [cycleId, setCycleId] = useState<string>(derived.current?.id ?? 'all')
  const [kind, setKind] = useState<'all' | Transaction['kind']>('all')
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)

  const cycle = derived.cycles.find((c) => c.id === cycleId)
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return state.transactions
      .filter((t) => !cycle || (t.date >= cycle.startDate && t.date <= cycle.endDate))
      .filter((t) => kind === 'all' || t.kind === kind)
      .filter((t) => cat === 'all' || t.categoryId === cat)
      .filter((t) => !query || (t.note ?? '').toLowerCase().includes(query))
      .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))
  }, [state.transactions, cycle, kind, cat, q])

  const byDate = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of rows) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [rows])

  const remove = async (t: Transaction): Promise<void> => {
    const ok = await run(window.dailypot.remove('transactions', t.id))
    if (ok) {
      const { createdAt: _c, ...restore } = t
      toast('Transaction deleted', { action: { label: 'Undo', run: () => void run(window.dailypot.upsert('transactions', restore)) } })
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Transactions</h1>
        <div className="row">
          <button className="btn" disabled={rows.length === 0} onClick={() => void run(window.dailypot.dataExportCsv(rows.map((r) => r.id))).then((ok) => ok && toast('CSV exported'))}>
            Export CSV
          </button>
          <button className="btn primary" onClick={() => setEditing('new')}>
            Add transaction
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-4">
          <Field label="Cycle">
            <select className="input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="all">All time</option>
              {[...derived.cycles].reverse().map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.startDate, true)} – {formatDate(c.endDate, true)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="all">All kinds</option>
              <option value="daily">Daily</option>
              <option value="nonDaily">Non-daily</option>
              <option value="income">Income</option>
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search notes">
            <input className="input" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. coffee" />
          </Field>
        </div>
      </div>

      <div className="card">
        {byDate.length === 0 ? (
          <Empty title={state.transactions.length === 0 ? 'No transactions yet' : 'Nothing matches these filters'}>
            {state.transactions.length === 0 ? <p>Add your first expense from the dashboard or with “Add transaction”.</p> : null}
          </Empty>
        ) : (
          byDate.map(([date, list]) => {
            const spend = list.filter((t) => t.kind !== 'income').reduce((s, t) => s + t.amount, 0)
            return (
              <div key={date}>
                <div className="day-head">
                  <span>
                    {weekdayShort(date)} {formatDate(date, true)}
                  </span>
                  <span className="num">
                    spent <Money value={spend} />
                  </span>
                </div>
                <div className="list">
                  {list.map((t) => {
                    const c = derived.categories.get(t.categoryId)
                    return (
                      <div className="list-item" key={t.id}>
                        <span className="dot" style={{ background: c?.color ?? '#999' }} aria-hidden />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div>{c?.name ?? 'Unknown'}</div>
                          <div className="faint">
                            {KIND_LABEL[t.kind]}
                            {t.note ? (
                              <>
                                {' · '}
                                <UserText>{t.note}</UserText>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <Money value={t.kind === 'income' ? t.amount : -t.amount} signed />
                        <button className="btn ghost sm" aria-label="Edit" onClick={() => setEditing(t)}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn ghost sm" aria-label="Delete" onClick={() => void remove(t)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {editing ? (
        <Modal title={editing === 'new' ? 'Add transaction' : 'Edit transaction'} onClose={() => setEditing(null)}>
          <TransactionForm {...(editing === 'new' ? {} : { existing: editing })} onDone={() => setEditing(null)} />
        </Modal>
      ) : null}
    </div>
  )
}
