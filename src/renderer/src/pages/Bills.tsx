/** F4 — Obligations (recurring monthly bills) with history of settlements. Broadsheet layout (docs/09 §8 "Bills"). */
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { addMonths, clampedDayIn, formatDate, formatMonth, monthOf } from '@shared/dates'
import { defaultStartMonth, dueDateOf, instanceKey, instanceStatus, type Instance, type InstanceStatus } from '@shared/engine'
import type { Obligation, ObligationPayment } from '@shared/schema'
import { PayDialog, SkipDialog } from '../components/BillActions'
import { BILL_STATUS as STATUS } from '../components/billStatus'
import { Chip, Cols, Confirm, Count, Empty, Field, FoldLine, IconButton, Modal, Money, MoneyInput, PageHead, UserText, plural, useMoneyField, type CSSVars } from '../components/ui'
import { newId, useReady } from '../state/app'
import '../styles/pages/money.css'

export function Bills(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { today, pot, currency, categories, cycles } = derived
  const [editing, setEditing] = useState<Obligation | 'new' | null>(null)
  const [historyOf, setHistoryOf] = useState<Obligation | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Obligation | null>(null)
  const thisMonth = monthOf(today)
  const firstTracked = cycles[0]?.startDate ?? today

  // Display order only: the bill whose next due date comes soonest first (ties by name).
  const nextDue = (o: Obligation): string => {
    const d = dueDateOf(o, thisMonth)
    return d >= today ? d : dueDateOf(o, addMonths(thisMonth, 1))
  }
  const active = state.obligations
    .filter((o) => !o.endMonth || o.endMonth > thisMonth)
    .sort((a, b) => {
      const da = nextDue(a)
      const db = nextDue(b)
      return da < db ? -1 : da > db ? 1 : a.name.localeCompare(b.name)
    })
  const archived = state.obligations.filter((o) => o.endMonth && o.endMonth <= thisMonth)
  const monthlyTotal = active.reduce((s, o) => s + o.amount, 0)

  const archive = (o: Obligation): void => {
    const latest = state.obligationPayments.filter((p) => p.obligationId === o.id).reduce((m, p) => (p.period > m ? p.period : m), thisMonth)
    void run(window.dailypot.upsert('obligations', { ...o, endMonth: latest }), `${o.name} archived after ${formatMonth(latest)}`)
  }

  /** This month's instance status for a bill, read from the engine's honoured settlements. */
  const thisMonthStatus = (o: Obligation): { status: InstanceStatus } | { note: string } => {
    if (o.startMonth > thisMonth) return { note: `from ${formatMonth(o.startMonth)}` }
    if (o.endMonth && o.endMonth < thisMonth) return { note: `ended ${formatMonth(o.endMonth)}` }
    const inst: Instance = { key: instanceKey(o.id, thisMonth), obligationId: o.id, name: o.name, period: thisMonth, dueDate: dueDateOf(o, thisMonth), plannedAmount: o.amount }
    if (inst.dueDate < firstTracked) return { note: 'before tracking' }
    return { status: instanceStatus(inst, pot.settlements.get(inst.key), today) }
  }

  const renderRow = (o: Obligation, isArchived: boolean, i: number): React.JSX.Element => {
    const hasPayments = state.obligationPayments.some((p) => p.obligationId === o.id)
    const cat = o.categoryId ? categories.get(o.categoryId) : undefined
    const month = thisMonthStatus(o)
    const style: CSSVars = { '--t0': '350ms', '--j': i, ...('status' in month ? { '--status': STATUS[month.status].color } : {}) }
    // Rendered in their own columns and again as fold lines under the name; only one copy is ever displayed (docs/09 §4.12).
    const months = (
      <>
        <span className="mono">
          {formatMonth(o.startMonth)}
          {o.endMonth ? ` – ${formatMonth(o.endMonth)}` : ' →'}
        </span>
        {isArchived && o.endMonth === thisMonth ? <Chip tone="neutral">ends this month</Chip> : null}
      </>
    )
    const category = cat ? (
      <span className="cat">
        <span className="dot" style={{ background: cat.color }} aria-hidden="true" />
        <UserText>{cat.name}</UserText>
      </span>
    ) : (
      <span className="faint">—</span>
    )
    return (
      <tr key={o.id} className="row-anim" style={style}>
        <td>
          <UserText>{o.name}</UserText>
          <FoldLine level={1} className="months">
            {months}
          </FoldLine>
          <FoldLine level={2}>{category}</FoldLine>
        </td>
        <td className="r">
          <Count value={o.amount} id={`bill-${o.id}`} delay={400 + i * 40} />
        </td>
        <td className="mono">Day {o.dueDay}</td>
        <td className="months" data-fold="1">
          {months}
        </td>
        <td data-fold="2">{category}</td>
        <td>{'status' in month ? <Chip tone={STATUS[month.status].tone}>{STATUS[month.status].label}</Chip> : <span className="faint">{month.note}</span>}</td>
        <td className="r">
          <span className="cell-actions">
            <button className="btn sm ghost" onClick={() => setHistoryOf(o)}>
              History
            </button>
            <button className="btn sm ghost" onClick={() => setEditing(o)}>
              Edit
            </button>
            {!isArchived ? (
              <button className="btn sm ghost" onClick={() => archive(o)}>
                Archive
              </button>
            ) : null}
            {!hasPayments ? (
              <IconButton label="Delete" tone="danger" size="sm" onClick={() => setConfirmDelete(o)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            ) : null}
          </span>
        </td>
      </tr>
    )
  }

  /* Folding ledger (docs/09 §4.12): Months folds into the name cell at 880px, Category at 620px; the actions wrap to two lines at 880px. */
  const head = (
    <>
      <Cols cols={['auto', 'num', 72, ['auto', 1], ['auto', 2], 120, 'actions']} />
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" className="r">Amount</th>
          <th scope="col">Due</th>
          <th scope="col" data-fold="1">Months</th>
          <th scope="col" data-fold="2">Category</th>
          <th scope="col">{formatMonth(thisMonth)}</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
    </>
  )

  return (
    <div className="page">
      <PageHead
        dateline={`${plural(active.length, 'active bill')} · ${archived.length} archived · ${formatMonth(thisMonth)}`}
        title="Bills"
        actions={
          <button className="btn primary" onClick={() => setEditing('new')}>
            Add bill
          </button>
        }
      />

      <div className="money-head rule">
        <div className="money-figure">
          <span className="stat-label">Active total</span>
          <Count value={monthlyTotal} currency={currency} hero="secondary" id="bills-total" delay={150} />
          <p className="dateline">
            per month · {plural(active.length, 'bill')} the pot pays
          </p>
        </div>
        <p className="muted money-note">Monthly bills the pot pays, nearest due date first. Unspent per-day money is set aside for them in due-date order; anything the pot can’t cover comes from your main balance.</p>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Active bills</h2>
          <span className="faint">{plural(active.length, 'bill')}</span>
        </div>
        {active.length === 0 ? (
          <Empty title="No bills yet">
            <p>Add your phone bill, gym, subscriptions… Unspent per-day money will go towards them.</p>
            <button className="btn primary" onClick={() => setEditing('new')}>
              Add bill
            </button>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table bills-list">
              {head}
              <tbody>{active.map((o, i) => renderRow(o, false, i))}</tbody>
            </table>
          </div>
        )}
      </div>

      {archived.length > 0 ? (
        <div className="card">
          <div className="card-title">
            <h2>Archived / ending</h2>
            <span className="faint">{plural(archived.length, 'bill')}</span>
          </div>
          <div className="table-wrap">
            <table className="table bills-list">
              {head}
              <tbody>{archived.map((o, i) => renderRow(o, true, active.length + i))}</tbody>
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
  const { today, currency } = derived
  const [name, setName] = useState(existing?.name ?? '')
  const amount = useMoneyField(existing?.amount)
  const [dueDay, setDueDay] = useState(existing ? String(existing.dueDay) : '')
  const due = Number(dueDay)
  const dueOk = Number.isInteger(due) && due >= 1 && due <= 31
  const [startMonth, setStartMonth] = useState(existing?.startMonth ?? '')
  const effectiveStart = startMonth || (dueOk ? defaultStartMonth(due, today) : monthOf(today))
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
        <MoneyInput field={amount} label={`Amount (${currency})`} />
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
        <Field label="First month to track" hint={dueOk ? `First due ${formatDate(clampedDayIn(effectiveStart, due), true)}. Already paid this month? Start next month.` : undefined}>
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
  const { today, pot, cycles, currency } = derived
  const [pay, setPay] = useState<{ inst: Instance; existing?: ObligationPayment } | null>(null)
  const [skip, setSkip] = useState<Instance | null>(null)
  const o = state.obligations.find((x) => x.id === obligation.id) ?? obligation
  const settlements = new Map(state.obligationPayments.filter((p) => p.obligationId === o.id).map((p) => [p.period, p]))
  const first = cycles[0]?.startDate ?? today

  const months = useMemo(() => {
    const out: string[] = []
    const nextMonth = addMonths(monthOf(today), 1)
    const last = o.endMonth && o.endMonth < nextMonth ? o.endMonth : nextMonth
    for (let m = o.startMonth; m <= last; m = addMonths(m, 1)) out.push(m)
    return out.reverse().slice(0, 24)
  }, [o.startMonth, o.endMonth, today])

  return (
    <Modal title={`${o.name} — history`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="bill-history stack">
        <p className="dateline">
          {formatMonth(o.startMonth)} {o.endMonth ? `– ${formatMonth(o.endMonth)}` : '→'} · due day {o.dueDay} · {months.length} month{months.length === 1 ? '' : 's'} shown
        </p>
        <div className="table-wrap">
          <table className="table bill-history-table">
            {/* Folding ledger (docs/09 §4.12): in the 520px dialog the due date folds under the month and the actions stack. */}
            <Cols cols={['auto', ['date', 1], 120, 136, 'actions']} />
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" data-fold="1">Due</th>
                <th scope="col">Status</th>
                <th scope="col" className="r">Amount</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const dueDate = dueDateOf(o, m)
                const inst: Instance = { key: instanceKey(o.id, m), obligationId: o.id, name: o.name, period: m, dueDate, plannedAmount: o.amount }
                const s = settlements.get(m)
                const tracked = dueDate >= first
                const status = tracked ? instanceStatus(inst, s, today) : null
                const split = s ? pot.splits.get(s.id) : undefined
                const style: CSSVars | undefined = status ? { '--status': STATUS[status].color } : undefined
                return (
                  <tr key={m} style={style}>
                    <td>
                      {formatMonth(m)}
                      <FoldLine level={1}>
                        due <span className="mono">{formatDate(dueDate)}</span>
                      </FoldLine>
                    </td>
                    <td className="mono" data-fold="1">
                      {formatDate(dueDate)}
                    </td>
                    <td>{status ? <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip> : <span className="faint">Before tracking</span>}</td>
                    <td className="r">
                      {s?.status === 'paid' ? (
                        <>
                          <Money value={s.amount} />
                          {split ? (
                            <span className="split">
                              <span>
                                {/* the separator travels with "pot X" (no-break space), so it never dangles when "main Y" wraps */}
                                pot <Money value={split.fromPot} />
                                &nbsp;·
                              </span>{' '}
                              <span>
                                main <Money value={split.fromMain} />
                              </span>
                            </span>
                          ) : null}
                        </>
                      ) : status === 'skipped' ? (
                        <span className="faint">—</span>
                      ) : tracked ? (
                        <Money value={o.amount} className="muted" />
                      ) : null}
                    </td>
                    <td className="r">
                      {tracked ? (
                        s ? (
                          <span className="cell-actions">
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
                          <span className="cell-actions">
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
        <p className="faint">Amounts in {currency}. “main” is the part the pot could not cover; the whole payment leaves your main balance.</p>
      </div>
      {pay ? <PayDialog instance={pay.inst} {...(pay.existing ? { existing: pay.existing } : {})} onClose={() => setPay(null)} /> : null}
      {skip ? <SkipDialog instance={skip} onClose={() => setSkip(null)} /> : null}
    </Modal>
  )
}
