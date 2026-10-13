/** F4 — Obligations (recurring monthly bills) with history of settlements. */
import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { addMonths, formatDate, formatMonth, monthOf } from '@shared/dates'
import { defaultStartMonth, dueDateOf, instanceKey, instanceStatus, type Instance } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { Obligation, ObligationPayment } from '@shared/schema'
import { PayDialog, SkipDialog } from '../components/BillActions'
import { Confirm, Empty, Field, Modal, Money, MoneyInput, UserText, useMoneyField } from '../components/ui'
import { newId, useReady } from '../state/app'

export function Bills(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [editing, setEditing] = useState<Obligation | 'new' | null>(null)
  const [historyOf, setHistoryOf] = useState<Obligation | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Obligation | null>(null)
  const thisMonth = monthOf(derived.today)
  const active = state.obligations.filter((o) => !o.endMonth || o.endMonth > thisMonth)
  const archived = state.obligations.filter((o) => o.endMonth && o.endMonth <= thisMonth)
  const monthlyTotal = active.reduce((s, o) => s + o.amount, 0)

  const archive = (o: Obligation): void => {
    const latest = state.obligationPayments.filter((p) => p.obligationId === o.id).reduce((m, p) => (p.period > m ? p.period : m), thisMonth)
    void run(window.dailypot.upsert('obligations', { ...o, endMonth: latest }), `${o.name} archived after ${formatMonth(latest)}`)
  }

  const renderRow = (o: Obligation, isArchived: boolean): React.JSX.Element => {
    const hasPayments = state.obligationPayments.some((p) => p.obligationId === o.id)
    return (
      <tr key={o.id}>
        <td>
          <UserText>{o.name}</UserText>
        </td>
        <td className="r">
          <Money value={o.amount} />
        </td>
        <td>Day {o.dueDay}</td>
        <td>
          {formatMonth(o.startMonth)}
          {o.endMonth ? ` – ${formatMonth(o.endMonth)}` : ' →'}
          {isArchived && o.endMonth === thisMonth ? <span className="chip neutral">ends this month</span> : null}
        </td>
        <td className="r">
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm ghost" onClick={() => setHistoryOf(o)}>
              History
            </button>
            <button className="btn sm ghost" aria-label="Edit" onClick={() => setEditing(o)}>
              <Pencil size={15} />
            </button>
            {!isArchived ? (
              <button className="btn sm ghost" onClick={() => archive(o)}>
                Archive
              </button>
            ) : null}
            {!hasPayments ? (
              <button className="btn sm ghost" aria-label="Delete" onClick={() => setConfirmDelete(o)}>
                <Trash2 size={15} />
              </button>
            ) : null}
          </span>
        </td>
      </tr>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Bills</h1>
          <p className="muted">
            Monthly bills the pot pays, nearest due date first. Active total: <strong>{formatMoney(monthlyTotal, derived.currency)}</strong> per month.
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          Add bill
        </button>
      </div>

      <div className="card">
        {active.length === 0 ? (
          <Empty title="No bills yet">
            <p>Add your phone bill, gym, subscriptions… Unspent per-day money will go towards them.</p>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="r">Amount</th>
                  <th>Due</th>
                  <th>Months</th>
                  <th />
                </tr>
              </thead>
              <tbody>{active.map((o) => renderRow(o, false))}</tbody>
            </table>
          </div>
        )}
      </div>

      {archived.length > 0 ? (
        <div className="card">
          <h2>Archived / ending</h2>
          <div className="table-wrap">
            <table className="table">
              <tbody>{archived.map((o) => renderRow(o, true))}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {editing ? <BillForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {historyOf ? <BillHistory obligation={historyOf} onClose={() => setHistoryOf(null)} /> : null}
      {confirmDelete ? (
        <Confirm
          title={`Delete ${confirmDelete.name}?`}
          message="This bill has no payment history, so it can be deleted."
          confirmLabel="Delete"
          danger
          onConfirm={() => void run(window.dailypot.remove('obligations', confirmDelete.id), 'Bill deleted')}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  )
}

function BillForm({ existing, onClose }: { existing: Obligation | undefined; onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [name, setName] = useState(existing?.name ?? '')
  const amount = useMoneyField(existing?.amount)
  const [dueDay, setDueDay] = useState(existing ? String(existing.dueDay) : '')
  const due = Number(dueDay)
  const dueOk = Number.isInteger(due) && due >= 1 && due <= 31
  const [startMonth, setStartMonth] = useState(existing?.startMonth ?? '')
  const effectiveStart = startMonth || (dueOk ? defaultStartMonth(due, derived.today) : monthOf(derived.today))
  const [endMonth, setEndMonth] = useState(existing?.endMonth ?? '')
  const expenseCats = state.categories.filter((c) => c.kind === 'expense' && (!c.archived || c.id === existing?.categoryId))
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? expenseCats.find((c) => c.name === 'Bills & subscriptions')?.id ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const valid = name.trim() && amount.value && dueOk && (!endMonth || endMonth >= effectiveStart)

  const save = async (): Promise<void> => {
    const item = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      amount: amount.value!,
      dueDay: due,
      startMonth: effectiveStart,
      ...(endMonth ? { endMonth } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(note.trim() ? { note: note.trim() } : {})
    }
    const ok = await run(window.dailypot.upsert('obligations', item), existing ? 'Bill saved' : 'Bill added')
    if (ok) onClose()
  }

  return (
    <Modal
      title={existing ? 'Edit bill' : 'Add bill'}
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
        <Field label="Name">
          <input className="input" dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Phone" />
        </Field>
        <MoneyInput field={amount} label={`Amount (${derived.currency})`} />
        <Field label="Due day of month" error={dueDay && !dueOk ? '1 to 31' : null} hint="31 means the last day in shorter months">
          <input className="input num" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="5" />
        </Field>
        <Field label="Category">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="First month to track"
          hint={dueOk ? `First due ${formatDate(dueDateOf({ ...({} as Obligation), dueDay: due }, effectiveStart), true)}. Already paid this month? Start next month.` : undefined}
        >
          <input className="input" type="month" value={effectiveStart} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
        <Field label="Last month (optional)" error={endMonth && endMonth < effectiveStart ? 'Before the first month' : null}>
          <input className="input" type="month" value={endMonth} min={effectiveStart} onChange={(e) => setEndMonth(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

function BillHistory({ obligation, onClose }: { obligation: Obligation; onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [pay, setPay] = useState<{ inst: Instance; existing?: ObligationPayment } | null>(null)
  const [skip, setSkip] = useState<Instance | null>(null)
  const o = state.obligations.find((x) => x.id === obligation.id) ?? obligation
  const settlements = new Map(state.obligationPayments.filter((p) => p.obligationId === o.id).map((p) => [p.period, p]))
  const first = derived.cycles[0]?.startDate ?? derived.today

  const months = useMemo(() => {
    const out: string[] = []
    const last = o.endMonth && o.endMonth < addMonths(monthOf(derived.today), 1) ? o.endMonth : addMonths(monthOf(derived.today), 1)
    for (let m = o.startMonth; m <= last; m = addMonths(m, 1)) out.push(m)
    return out.reverse().slice(0, 24)
  }, [o.startMonth, o.endMonth, derived.today])

  return (
    <Modal title={`${o.name} — history`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Due</th>
              <th>Status</th>
              <th className="r">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const dueDate = dueDateOf(o, m)
              const inst: Instance = { key: instanceKey(o.id, m), obligationId: o.id, name: o.name, period: m, dueDate, plannedAmount: o.amount }
              const s = settlements.get(m)
              const tracked = dueDate >= first
              const status = tracked ? instanceStatus(inst, s, derived.today) : null
              const split = s ? derived.pot.splits.get(s.id) : undefined
              return (
                <tr key={m}>
                  <td>{formatMonth(m)}</td>
                  <td>{formatDate(dueDate)}</td>
                  <td>
                    {status ? <span className={`chip ${status === 'paid' ? 'ok' : status === 'overdue' ? 'danger' : status === 'skipped' ? 'neutral' : 'info'}`}>{status === 'dueToday' ? 'Due today' : status[0]!.toUpperCase() + status.slice(1)}</span> : <span className="faint">Before tracking</span>}
                  </td>
                  <td className="r">
                    {s?.status === 'paid' ? (
                      <span>
                        <Money value={s.amount} />
                        {split && split.fromMain > 0 ? <div className="faint warn-text">main {formatMoney(split.fromMain, derived.currency)}</div> : null}
                      </span>
                    ) : null}
                  </td>
                  <td className="r">
                    {tracked ? (
                      s ? (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          {s.status === 'paid' ? (
                            <button className="btn sm ghost" onClick={() => setPay({ inst, existing: s })}>
                              Edit
                            </button>
                          ) : null}
                          <button className="btn sm ghost" onClick={() => void run(window.dailypot.remove('obligationPayments', s.id), 'Settlement removed')}>
                            Undo
                          </button>
                        </span>
                      ) : (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn sm" onClick={() => setPay({ inst })}>
                            Pay
                          </button>
                          <button className="btn sm ghost" onClick={() => setSkip(inst)}>
                            Skip
                          </button>
                        </span>
                      )
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pay ? <PayDialog instance={pay.inst} {...(pay.existing ? { existing: pay.existing } : {})} onClose={() => setPay(null)} /> : null}
      {skip ? <SkipDialog instance={skip} onClose={() => setSkip(null)} /> : null}
    </Modal>
  )
}
