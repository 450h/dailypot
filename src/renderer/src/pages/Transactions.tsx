/**
 * F3 — Transactions (docs/09 §8 "Transactions"): a true ledger. Filters in one hairline bar, summary tiles for
 * the filtered set, day groups with mono datelines, 36px rows with the category dot, edit/delete on hover or
 * focus, delete → undo toast, CSV export of the current filter. No money rules here: sums are display totals
 * of the filtered list; "before tracking" is the engine's first tracked day (docs/05 §3).
 */
import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatDate, weekdayShort } from '@shared/dates'
import type { Transaction } from '@shared/schema'
import { TransactionForm } from '../components/TransactionForm'
import { Chip, Count, Empty, Field, IconButton, Modal, Money, PageHead, Seg, UserText, type CSSVars } from '../components/ui'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReady } from '../state/app'
import '../styles/pages/history.css'

const KIND_LABEL: Record<Transaction['kind'], string> = { daily: 'Daily', nonDaily: 'Non-daily', income: 'Income' }
type KindFilter = 'all' | Transaction['kind']
const KIND_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'nonDaily', label: 'Non-daily' },
  { value: 'income', label: 'Income' }
]

/* Choreography (docs/09 §7): tiles count from 250ms, rows rise 220ms each from 450ms, 40ms apart. */
const T_TILES = 250
const T_ROWS = 450
const MAX_STAGGER = 16

export function Transactions(): React.JSX.Element {
  const { state, derived, run, toast } = useReady()
  const { cycles, current, categories, currency } = derived
  const reduced = usePrefersReducedMotion()
  const [cycleId, setCycleId] = useState<string>(current?.id ?? 'all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)

  const cycle = cycles.find((c) => c.id === cycleId)
  const firstTracked = cycles[0]?.startDate
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return state.transactions
      .filter((t) => !cycle || (t.date >= cycle.startDate && t.date <= cycle.endDate))
      .filter((t) => kind === 'all' || t.kind === kind)
      .filter((t) => cat === 'all' || t.categoryId === cat)
      .filter((t) => !query || (t.note ?? '').toLowerCase().includes(query))
      .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))
  }, [state.transactions, cycle, kind, cat, q])

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of rows) m.set(t.date, [...(m.get(t.date) ?? []), t])
    let k = 0
    return [...m.entries()].map(([date, list]) => {
      const g = {
        date,
        list,
        k0: k,
        spent: list.filter((t) => t.kind !== 'income').reduce((s, t) => s + t.amount, 0),
        income: list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
      }
      k += list.length
      return g
    })
  }, [rows])

  // Display totals of the filtered list (no rule involved).
  const spent = useMemo(() => rows.filter((t) => t.kind !== 'income').reduce((s, t) => s + t.amount, 0), [rows])
  const income = useMemo(() => rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0), [rows])

  const filtered = cycleId !== 'all' || kind !== 'all' || cat !== 'all' || q.trim() !== ''
  const clearFilters = (): void => {
    setCycleId('all')
    setKind('all')
    setCat('all')
    setQ('')
  }

  const remove = async (t: Transaction): Promise<void> => {
    setLeaving(t.id)
    if (!reduced) await new Promise((r) => setTimeout(r, 200))
    const ok = await run(window.dailypot.remove('transactions', t.id))
    setLeaving(null)
    if (ok) {
      const { createdAt: _c, ...restore } = t
      toast('Transaction deleted', { action: { label: 'Undo', run: () => void run(window.dailypot.upsert('transactions', restore)) } })
    }
  }

  const dateline = `${rows.length} TRANSACTION${rows.length === 1 ? '' : 'S'} · ${cycle ? `CYCLE ${formatDate(cycle.startDate)} – ${formatDate(cycle.endDate, true)}` : 'ALL TIME'}`.toUpperCase()

  return (
    <div className="page">
      <PageHead
        dateline={dateline}
        title="Transactions"
        actions={
          <>
            <button className="btn" disabled={rows.length === 0} onClick={() => void run(window.dailypot.dataExportCsv(rows.map((r) => r.id))).then((ok) => ok && toast('CSV exported'))}>
              Export CSV
            </button>
            <button className="btn primary" onClick={() => setEditing('new')}>
              Add transaction
            </button>
          </>
        }
      />

      <div className="hx-filters rule">
        <div className="grid grid-4">
          <Field label="Cycle">
            <select className="input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="all">All time</option>
              {[...cycles].reverse().map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.startDate, true)} – {formatDate(c.endDate, true)}
                  {c.id === current?.id ? ' · current' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="field">
            <span>Kind</span>
            <Seg label="Kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
          </div>
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

      <div className="tiles">
        <div className="tile">
          <span className="stat-label">Spent</span>
          <span className="stat-value">
            <Count value={spent} currency={currency} id="tx-spent" delay={T_TILES} />
          </span>
          <span className="stat-sub">Daily and non-daily in this view</span>
        </div>
        <div className="tile">
          <span className="stat-label">Income</span>
          <span className={`stat-value ${income > 0 ? 'pos' : ''}`}>
            <Count value={income} currency={currency} id="tx-income" delay={T_TILES + 60} signed />
          </span>
          <span className="stat-sub">Income doesn’t touch the pot</span>
        </div>
        <div className="tile">
          <span className="stat-label">Entries</span>
          <span className="stat-value">
            <Count value={rows.length * 100} integer delay={T_TILES + 120} duration={600} />
          </span>
          <span className="stat-sub">{cycle ? 'In the selected cycle' : 'Across all time'}</span>
        </div>
      </div>

      <div className="card">
        {groups.length === 0 ? (
          <Empty title={state.transactions.length === 0 ? 'No transactions yet' : 'Nothing matches these filters'}>
            {state.transactions.length === 0 ? (
              <p>Add your first expense from the dashboard or with “Add transaction”.</p>
            ) : filtered ? (
              <button className="btn sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </Empty>
        ) : (
          groups.map((g) => (
            <section key={g.date} aria-label={`${weekdayShort(g.date)} ${formatDate(g.date, true)}`}>
              <div className="day-head row-anim" style={{ '--t0': `${T_ROWS}ms`, '--j': Math.min(g.k0, MAX_STAGGER) } as CSSVars}>
                <span>
                  {weekdayShort(g.date)} {formatDate(g.date, true)}
                </span>
                <span className="num">
                  spent <Money value={g.spent} />
                  {g.income > 0 ? (
                    <>
                      {' · income '}
                      <Money value={g.income} signed />
                    </>
                  ) : null}
                </span>
              </div>
              <div className="list">
                {g.list.map((t, ri) => {
                  const c = categories.get(t.categoryId)
                  const beforeTracking = firstTracked !== undefined && t.date < firstTracked
                  return (
                    <div className={`list-item hx-row row-anim ${leaving === t.id ? 'collapse-out' : ''}`} key={t.id} style={{ '--t0': `${T_ROWS}ms`, '--j': Math.min(g.k0 + ri, MAX_STAGGER) } as CSSVars}>
                      <span className="dot" style={{ background: c?.color ?? 'var(--ink-3)' }} aria-hidden="true" />
                      <div className="hx-name">
                        <div className="hx-title">
                          <UserText>{c?.name ?? 'Unknown category'}</UserText>
                          {beforeTracking ? (
                            <Chip tone="neutral" glyph="–" title="Dated before your first tracked day, so it doesn’t affect the pot. Extend tracking back under Pot history to include it.">
                              before tracking
                            </Chip>
                          ) : null}
                        </div>
                        <div className="hx-meta">
                          {KIND_LABEL[t.kind]}
                          {t.note ? (
                            <>
                              {' · '}
                              <UserText>{t.note}</UserText>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <Money className="hx-amount" value={t.kind === 'income' ? t.amount : -t.amount} signed />
                      <span className="hx-actions">
                        <IconButton label={`Edit ${c?.name ?? 'transaction'} ${formatDate(t.date)}`} size="sm" onClick={() => setEditing(t)}>
                          <Pencil size={15} aria-hidden />
                        </IconButton>
                        <IconButton label={`Delete ${c?.name ?? 'transaction'} ${formatDate(t.date)}`} size="sm" tone="danger" disabled={leaving === t.id} onClick={() => void remove(t)}>
                          <Trash2 size={15} aria-hidden />
                        </IconButton>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))
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
