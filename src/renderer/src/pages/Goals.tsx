/** F6 — Savings goals. */
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@shared/dates'
import { goalFigures } from '@shared/engine'
import type { Goal } from '@shared/schema'
import { Confirm, Empty, Field, Modal, Money, MoneyInput, ProgressBar, UserText, useMoneyField } from '../components/ui'
import { newId, useReady } from '../state/app'

export function Goals(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contrib, setContrib] = useState<{ goal: Goal; withdraw: boolean } | null>(null)
  const [history, setHistory] = useState<Goal | null>(null)
  const [del, setDel] = useState<Goal | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const goals = state.goals.filter((g) => showArchived || !g.archived)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Savings goals</h1>
          <p className="muted">Money you set aside for something. Contributions don’t affect the pot.</p>
        </div>
        <div className="row">
          {state.goals.some((g) => g.archived) ? (
            <label className="row faint">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
          ) : null}
          <button className="btn primary" onClick={() => setEditing('new')}>
            New goal
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="card">
          <Empty title="No goals yet">
            <p>Create a goal like “Car — 20,000 by June” and track how much you need each month.</p>
          </Empty>
        </div>
      ) : (
        <div className="grid grid-2">
          {goals.map((g) => {
            const f = goalFigures(state, g, derived.today)
            return (
              <div className="card" key={g.id}>
                <div className="card-title">
                  <h2>
                    <UserText>{g.name}</UserText> {g.archived ? <span className="chip neutral">archived</span> : null}
                  </h2>
                  <span className="row">
                    <button className="btn sm ghost" aria-label="Edit" onClick={() => setEditing(g)}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn sm ghost" aria-label="Delete" onClick={() => setDel(g)}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
                <div className="row-between">
                  <span className="stat-value">
                    <Money value={f.saved} currency={derived.currency} />
                  </span>
                  <span className="muted">
                    of <Money value={g.targetAmount} /> · {Math.round(f.progress * 100)}%
                  </span>
                </div>
                <ProgressBar value={f.progress} big label={`${g.name} progress`} />
                <p className="muted">
                  {f.remaining === 0 ? (
                    'Goal reached 🎉'
                  ) : f.targetPassed ? (
                    <>
                      Target date {formatDate(g.targetDate!, true)} passed · <Money value={f.remaining} /> to go
                    </>
                  ) : f.neededPerMonth !== null ? (
                    <>
                      Save about <Money value={f.neededPerMonth} currency={derived.currency} /> per month to reach it by {formatDate(g.targetDate!, true)}
                    </>
                  ) : (
                    <>
                      <Money value={f.remaining} currency={derived.currency} /> to go · no target date
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
                </div>
              </div>
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
          message="This deletes the goal and all its contributions. Consider archiving instead (edit → archived)."
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
  const { derived, run } = useReady()
  const [name, setName] = useState(existing?.name ?? '')
  const target = useMoneyField(existing?.targetAmount)
  const [date, setDate] = useState(existing?.targetDate ?? '')
  const [archived, setArchived] = useState(existing?.archived ?? false)
  const valid = name.trim() && target.value
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
        <MoneyInput field={target} label={`Target (${derived.currency})`} />
        <Field label="Target date (optional)">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {existing ? (
        <label className="row">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
        </label>
      ) : null}
    </Modal>
  )
}

function ContributionForm({ goal, withdraw, onClose }: { goal: Goal; withdraw: boolean; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const amount = useMoneyField()
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? derived.today
  const [note, setNote] = useState('')
  const valid = amount.value && date <= derived.today
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
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`Amount (${derived.currency})`} autoFocus />
        <Field label="Date">
          <input className="input" type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

function GoalHistory({ goal, onClose }: { goal: Goal; onClose: () => void }): React.JSX.Element {
  const { state, run } = useReady()
  const rows = state.goalContributions.filter((c) => c.goalId === goal.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <Modal title={`${goal.name} — history`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      {rows.length === 0 ? (
        <p className="muted">No contributions yet.</p>
      ) : (
        <table className="table">
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.date, true)}</td>
                <td>
                  <UserText className="faint">{c.note}</UserText>
                </td>
                <td className="r">
                  <Money value={c.amount} signed />
                </td>
                <td className="r">
                  <button className="btn sm ghost" aria-label="Delete" onClick={() => void run(window.dailypot.remove('goalContributions', c.id), 'Removed')}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
