/** F6 — Savings goals as poster cards (docs/09 §8 "Savings goals"; wording from docs/05 §7 and §10). */
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatDate } from '@shared/dates'
import { goalFigures } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { Goal } from '@shared/schema'
import { Chip, Cols, Confirm, Count, Empty, Field, IconButton, Modal, Money, MoneyInput, PageHead, ProgressBar, UserText, plural, useMoneyField, type CSSVars } from '../components/ui'
import { newId, useReady } from '../state/app'
import '../styles/pages/money.css'

/** Empty-state illustration: a jar with a rising fill and a coin, CSS/SVG only, decorative. */
function GoalsArt(): React.JSX.Element {
  return (
    <svg className="goals-art" viewBox="0 0 132 100" aria-hidden="true" focusable="false">
      <line className="rule-line" x1="8" y1="94" x2="124" y2="94" />
      <path className="jar" d="M38 22h56v62a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6V22z" />
      <rect className="fill" x="40" y="58" width="52" height="30" />
      <rect className="jar" x="46" y="10" width="40" height="12" rx="1" />
      <circle className="coin" cx="66" cy="42" r="9" />
      <line className="rule-line" x1="62" y1="42" x2="70" y2="42" />
    </svg>
  )
}

export function Goals(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { today, currency, netWorth } = derived
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contrib, setContrib] = useState<{ goal: Goal; withdraw: boolean } | null>(null)
  const [history, setHistory] = useState<Goal | null>(null)
  const [del, setDel] = useState<Goal | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  // Memoised per payload: the page's dialog state changes must not rescan every contribution.
  const goals = useMemo(() => state.goals.filter((g) => showArchived || !g.archived), [state, showArchived])
  const activeCount = state.goals.filter((g) => !g.archived).length
  const archivedCount = state.goals.length - activeCount
  const figures = useMemo(() => goals.map((g) => goalFigures(state, g, today)), [goals, state, today])
  const reachedCount = figures.filter((f) => !f.goal.archived && f.remaining === 0).length

  return (
    <div className="page">
      <PageHead
        dateline={`${plural(activeCount, 'active goal')} · ${reachedCount} reached${archivedCount ? ` · ${archivedCount} archived` : ''}`}
        title="Savings goals"
        actions={
          <>
            {archivedCount > 0 ? (
              <label className="row faint">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
              </label>
            ) : null}
            <button className="btn primary" onClick={() => setEditing('new')}>
              New goal
            </button>
          </>
        }
      />

      <div className="money-head rule">
        <div className="money-figure">
          <span className="stat-label">Saved across goals</span>
          <Count value={netWorth.savings} currency={currency} hero="secondary" id="goals-total" delay={150} />
          <p className="dateline">{plural(activeCount, 'active goal')} · counted in your net worth</p>
        </div>
        <p className="muted money-note">Money you set aside for something. Contributions don’t affect the pot; they count in your net worth until a goal is archived.</p>
      </div>

      {goals.length === 0 ? (
        <div className="card">
          <Empty title="No goals yet">
            <GoalsArt />
            <p>Create a goal like “Car — 20,000 by June” and see how much to put aside each month.</p>
            <button className="btn primary" onClick={() => setEditing('new')}>
              New goal
            </button>
          </Empty>
        </div>
      ) : (
        <div className="grid grid-2">
          {figures.map((f, i) => {
            const g = f.goal
            const reached = f.remaining === 0
            const pct = Math.round(f.progress * 100)
            const style: CSSVars = { '--t0': '250ms', '--j': i }
            return (
              <article className={`card poster row-anim ${reached ? 'reached' : ''}`} key={g.id} style={style} aria-label={g.name}>
                <div className="card-title">
                  <div>
                    <h2>
                      <UserText>{g.name}</UserText>
                    </h2>
                    {g.targetDate ? <p className="faint">by {formatDate(g.targetDate, true)}</p> : null}
                  </div>
                  <span className="row">
                    {reached ? <Chip tone="ok">Reached</Chip> : null}
                    {g.archived ? <Chip tone="neutral">archived</Chip> : null}
                  </span>
                </div>
                <div className="poster-figure">
                  <Count value={f.saved} currency={currency} hero="secondary" id={`goal-${g.id}`} delay={300 + Math.min(i, 8) * 60} />
                  <span className="muted num">
                    of <Money value={g.targetAmount} /> · {pct}%
                  </span>
                </div>
                <ProgressBar value={f.progress} big tone={reached ? 'ok' : 'accent'} anim delay={500 + Math.min(i, 8) * 60} label={`${g.name}: ${formatMoney(f.saved, currency)} of ${formatMoney(g.targetAmount, currency)} saved`} />
                <p className="poster-note">
                  {reached ? (
                    <>
                      <span className="glyph" aria-hidden="true">
                        ✓
                      </span>
                      goal reached · <Money value={f.saved} /> saved of <Money value={g.targetAmount} />
                    </>
                  ) : f.targetPassed ? (
                    <>
                      target date passed ({formatDate(g.targetDate!, true)}) · <Money value={f.remaining} /> to go
                    </>
                  ) : f.neededPerMonth !== null ? (
                    <>
                      save about <Money value={f.neededPerMonth} currency={currency} /> per month to reach it by {formatDate(g.targetDate!, true)}
                    </>
                  ) : (
                    <>
                      <Money value={f.remaining} currency={currency} /> to go · no target date
                    </>
                  )}
                </p>
                <div className="row">
                  <button className="btn sm primary" onClick={() => setContrib({ goal: g, withdraw: false })}>
                    Add money
                  </button>
                  <button className="btn sm" onClick={() => setContrib({ goal: g, withdraw: true })}>
                    Withdraw
                  </button>
                  <button className="btn sm ghost" onClick={() => setHistory(g)}>
                    History
                  </button>
                  <button className="btn sm ghost" onClick={() => setEditing(g)}>
                    Edit
                  </button>
                  <button className="btn sm ghost danger" onClick={() => setDel(g)}>
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing ? <GoalForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {contrib ? <ContributionForm goal={contrib.goal} withdraw={contrib.withdraw} onClose={() => setContrib(null)} /> : null}
      {history ? <GoalHistory goal={history} onClose={() => setHistory(null)} /> : null}
      {del ? (
        <Confirm
          title={`Delete ${del.name}?`}
          message={
            <>
              <p>
                This deletes the goal and all its contributions ({formatMoney(goalFigures(state, del, today).saved, currency)} saved). The history is gone for good.
              </p>
              <p>Prefer archiving (Edit → Archived) to keep the history: an archived goal is closed, so your net worth drops by the amount saved in it.</p>
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => void run(window.dailypot.remove('goals', del.id), 'Goal deleted')}
          onClose={() => setDel(null)}
        />
      ) : null}
    </div>
  )
}

function GoalForm({ existing, onClose }: { existing: Goal | undefined; onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { today, currency } = derived
  const [name, setName] = useState(existing?.name ?? '')
  const target = useMoneyField(existing?.targetAmount)
  const [date, setDate] = useState(existing?.targetDate ?? '')
  const [archived, setArchived] = useState(existing?.archived ?? false)
  const valid = name.trim() && target.value
  const saved = existing ? goalFigures(state, existing, today).saved : 0
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('goals', {
        id: existing?.id ?? newId(),
        name: name.trim(),
        targetAmount: target.value!,
        archived,
        ...(date ? { targetDate: date } : {})
      }),
      'Goal saved'
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={existing ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Car" />
      </Field>
      <div className="grid grid-2">
        <MoneyInput field={target} label={`Target (${currency})`} />
        <Field label="Target date (optional)">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {existing ? (
        <div className="stack" style={{ gap: 4 }}>
          <label className="row">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
          </label>
          <p className="faint">
            Archived = closed. The goal stops counting in your net worth, which drops by the amount saved in it ({formatMoney(saved, currency)}); its contributions stay recorded as cash that left your main balance. To keep the money counted, record a withdrawal first.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}

function ContributionForm({ goal, withdraw, onClose }: { goal: Goal; withdraw: boolean; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const { today, currency } = derived
  const amount = useMoneyField()
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? today
  const [note, setNote] = useState('')
  const valid = amount.value && date <= today
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('goalContributions', {
        id: newId(),
        goalId: goal.id,
        date,
        amount: withdraw ? -amount.value! : amount.value!,
        ...(note.trim() ? { note: note.trim() } : {})
      }),
      withdraw ? 'Withdrawal recorded' : 'Contribution added'
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={`${withdraw ? 'Withdraw from' : 'Add to'} ${goal.name}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <p className="muted">{withdraw ? 'Money moved back to your main balance; it stops counting as savings.' : 'Money set aside from your main balance; your net worth stays the same.'}</p>
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`Amount (${currency})`} autoFocus />
        <Field label="Date" error={date > today ? 'Can’t be in the future' : null}>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

function GoalHistory({ goal, onClose }: { goal: Goal; onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const rows = state.goalContributions.filter((c) => c.goalId === goal.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const saved = rows.reduce((s, c) => s + c.amount, 0)
  return (
    <Modal title={`${goal.name} — history`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      {rows.length === 0 ? (
        <p className="muted">No contributions yet.</p>
      ) : (
        <div className="stack">
          <p className="dateline">
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · saved {formatMoney(saved, derived.currency)}
          </p>
          <div className="table-wrap">
            <table className="table">
              <Cols cols={[104, 'auto', 'num', 48]} />
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Note</th>
                  <th className="r">Amount</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{formatDate(c.date, true)}</td>
                    <td>{c.note ? <UserText className="faint">{c.note}</UserText> : <span className="faint">{c.amount < 0 ? 'withdrawal' : 'contribution'}</span>}</td>
                    <td className="r">
                      <Money value={c.amount} signed />
                    </td>
                    <td className="r">
                      <IconButton label="Delete" tone="danger" size="sm" onClick={() => void run(window.dailypot.remove('goalContributions', c.id), 'Removed')}>
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
