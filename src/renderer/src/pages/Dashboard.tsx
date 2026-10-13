/** F2 — Dashboard: today, pot, bills, safe-to-spend, quick add, nudges. */
import { useState } from 'react'
import { addDays, diffDays, formatDate } from '@shared/dates'
import { cycleLength, dashboardBills, earlyStartWindow, safeToSpend, type BillRow } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { PageKey } from '../App'
import { PayDialog, SkipDialog } from '../components/BillActions'
import { TransactionForm } from '../components/TransactionForm'
import { Field, Modal, Money, MoneyInput, ProgressBar, useMoneyField } from '../components/ui'
import { newId, useReady } from '../state/app'

const STATUS: Record<BillRow['status'], { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'ok' },
  skipped: { label: 'Skipped', cls: 'neutral' },
  overdue: { label: 'Overdue', cls: 'danger' },
  dueToday: { label: 'Due today', cls: 'warn' },
  upcoming: { label: 'Upcoming', cls: 'info' }
}

export function Dashboard({ go }: { go: (p: PageKey) => void }): React.JSX.Element {
  const { state, derived, meta, run } = useReady()
  const { current, pot, today, currency } = derived
  const [pay, setPay] = useState<BillRow | null>(null)
  const [skip, setSkip] = useState<BillRow | null>(null)
  const [allowanceOpen, setAllowanceOpen] = useState(false)
  const [earlyOpen, setEarlyOpen] = useState(false)

  if (!current) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <div className="banner warn">No budget cycle covers today. Restart DailyPot to roll cycles forward.</div>
      </div>
    )
  }

  const todayRow = pot.days.find((d) => d.date === today)
  const spentToday = todayRow?.spent ?? 0
  const A = current.dailyAllowance
  const guide = safeToSpend(pot, current, today)
  const bills = dashboardBills(pot, current, today)
  const dayNo = diffDays(current.startDate, today) + 1
  const len = cycleLength(current)
  const opening = pot.cycleOpening.get(current.id) ?? 0
  const yesterday = addDays(today, -1)
  const yRow = pot.days.find((d) => d.date === yesterday)
  const early = earlyStartWindow(current, today)
  const lastExport = state.settings.lastExportAt
  const exportAge = lastExport ? diffDays(lastExport.slice(0, 10), today) : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Today · {formatDate(today, true)}</h1>
          <p className="muted">
            Cycle {formatDate(current.startDate)} – {formatDate(current.endDate)} · day {dayNo} of {len}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setAllowanceOpen(true)}>
            Change per-day
          </button>
          {early.allowed ? (
            <button className="btn" onClick={() => setEarlyOpen(true)}>
              Salary arrived early?
            </button>
          ) : null}
        </div>
      </div>

      {meta.readOnly ? <div className="banner danger">Read-only: your data file was made by a newer version of DailyPot. Update the app to make changes.</div> : null}
      {meta.restoredFromBackup ? <div className="banner warn">Your data file was damaged, so DailyPot restored the newest automatic backup. The damaged file was kept in your data folder.</div> : null}
      {meta.newCycleStarted ? (
        <div className="banner ok">
          <span>
            A new cycle started. Your per-day is <strong>{formatMoney(A, currency)}</strong> — keep it or change it.
          </span>
          <span className="row">
            <button className="btn sm primary" onClick={() => void run(window.dailypot.setAllowance(A), 'Per-day kept')}>
              Keep {formatMoney(A, currency)}
            </button>
            <button className="btn sm" onClick={() => setAllowanceOpen(true)}>
              Change
            </button>
          </span>
        </div>
      ) : null}
      {yRow?.unlogged ? (
        <div className="banner info">
          <span>No spending logged yesterday ({formatDate(yesterday)}). Add it below with yesterday’s date, or confirm you spent nothing.</span>
          <button className="btn sm" onClick={() => void run(window.dailypot.upsert('confirmedDays', { id: newId(), date: yesterday }))}>
            ✓ I spent nothing
          </button>
        </div>
      ) : null}
      {exportAge === null || exportAge >= 30 ? (
        <div className="banner info">
          <span>{exportAge === null ? 'You haven’t exported a backup yet.' : `Last export ${exportAge} days ago.`} Automatic backups live on this PC only — export a copy to OneDrive or a USB drive.</span>
          <button className="btn sm" onClick={() => void run(window.dailypot.dataExport(), 'Exported')}>
            Export now
          </button>
        </div>
      ) : null}

      <div className="grid grid-3">
        <div className="card">
          <span className="stat-label">Left to spend today</span>
          <span className={`stat-value ${A - spentToday < 0 ? 'neg' : ''}`}>
            <Money value={A - spentToday} currency={currency} />
          </span>
          <span className="stat-sub">
            Spent <Money value={spentToday} /> of <Money value={A} /> per-day
          </span>
          <ProgressBar value={A > 0 ? spentToday / A : 0} label="Spent today" />
        </div>

        <div className="card">
          <span className="stat-label">Side pot</span>
          <span className={`stat-value ${pot.balance < 0 ? 'neg' : ''}`}>
            <Money value={pot.balance} currency={currency} />
          </span>
          <span className="stat-sub">
            {pot.balance < 0 ? 'Pot deficit · ' : ''}Pot after today: <Money value={pot.projected} /> · opened this cycle at <Money value={opening} />
          </span>
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('pot')}>
            See how the pot was built →
          </button>
        </div>

        <div className="card">
          <span className="stat-label">Safe to spend per day</span>
          {guide.allFunded ? (
            <>
              <span className="stat-value pos">
                <Money value={A} currency={currency} />
              </span>
              <span className="stat-sub">All bills this cycle are funded — your full per-day is safe.</span>
            </>
          ) : guide.safeDaily >= 0 ? (
            <>
              <span className="stat-value">
                <Money value={guide.safeDaily} currency={currency} />
              </span>
              <span className="stat-sub">
                Spend at most this per day (today: <Money value={Math.max(0, guide.safeDaily - spentToday)} /> left) so the pot covers your upcoming bills.
              </span>
            </>
          ) : (
            <>
              <span className="stat-value neg">
                <Money value={0} currency={currency} />
              </span>
              <span className="stat-sub warn-text">
                The pot can’t cover upcoming bills even if you spend nothing — about {formatMoney(guide.unavoidableShortfall, currency)} will come from your main balance.
              </span>
            </>
          )}
          {guide.fromMainNow > 0 ? (
            <span className="stat-sub warn-text">About {formatMoney(guide.fromMainNow, currency)} of today’s/overdue bills will come from your main balance.</span>
          ) : null}
        </div>
      </div>

      <div className="card">
        <h2>Add an expense</h2>
        <TransactionForm compact />
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Bills</h2>
          <button className="btn sm ghost" onClick={() => go('bills')}>
            Manage bills →
          </button>
        </div>
        {bills.length === 0 ? (
          <p className="muted">No bills due this cycle. Add your phone, gym and subscriptions under Bills so the pot can pay them.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Due</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                  <th style={{ width: '22%' }}>From the pot</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const st = STATUS[b.status]
                  const settled = b.status === 'paid' || b.status === 'skipped'
                  return (
                    <tr key={b.instance.key}>
                      <td dir="auto">{b.instance.name}</td>
                      <td>{formatDate(b.instance.dueDate)}</td>
                      <td className="r">
                        <Money value={b.amount} />
                      </td>
                      <td>
                        <span className={`chip ${st.cls}`}>{st.label}</span>
                      </td>
                      <td>
                        {b.status === 'paid' && b.split ? (
                          <span className="faint">
                            pot <Money value={b.split.fromPot} />
                            {b.split.fromMain > 0 ? (
                              <>
                                {' '}
                                · <span className="warn-text">main <Money value={b.split.fromMain} /></span>
                              </>
                            ) : null}
                          </span>
                        ) : settled ? null : (
                          <div className="stack" style={{ gap: 2 }}>
                            <ProgressBar value={b.amount > 0 ? b.funded / b.amount : 1} label={`${b.instance.name} funded`} />
                            <span className="faint">
                              <Money value={b.funded} /> / <Money value={b.amount} /> funded
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="r">
                        {!settled ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn sm primary" onClick={() => setPay(b)}>
                              Mark paid
                            </button>
                            <button className="btn sm ghost" onClick={() => setSkip(b)}>
                              Skip
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint">Figures are recalculated from your history, so editing a past expense can change how past bills were split.</p>
      </div>

      {pay ? <PayDialog instance={pay.instance} onClose={() => setPay(null)} /> : null}
      {skip ? <SkipDialog instance={skip.instance} onClose={() => setSkip(null)} /> : null}
      {allowanceOpen ? <AllowanceDialog onClose={() => setAllowanceOpen(false)} /> : null}
      {earlyOpen ? <EarlyStartDialog onClose={() => setEarlyOpen(false)} /> : null}
    </div>
  )
}

function AllowanceDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const current = derived.current!
  const field = useMoneyField(current.dailyAllowance)
  const closedDays = Math.max(0, diffDays(current.startDate, derived.today))
  const delta = field.value === null ? 0 : (field.value - current.dailyAllowance) * closedDays
  return (
    <Modal
      title="Per-day for this cycle"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={field.value === null}
            onClick={() => void run(window.dailypot.setAllowance(field.value!), 'Per-day updated').then((ok) => ok && onClose())}
          >
            Save
          </button>
        </>
      }
    >
      <p className="muted">
        Applies to every day of the current cycle ({formatDate(current.startDate)} – {formatDate(current.endDate)}), including days already passed. Next cycles start with
        the same amount.
      </p>
      <MoneyInput field={field} label={`Per-day (${derived.currency})`} allowZero />
      {delta !== 0 ? (
        <div className={`banner ${delta < 0 ? 'warn' : 'info'}`}>
          The pot changes by {formatMoney(delta, derived.currency)} now ({closedDays} past day(s) × {formatMoney(delta / Math.max(1, closedDays), derived.currency)}).
        </div>
      ) : null}
    </Modal>
  )
}

function EarlyStartDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const w = earlyStartWindow(derived.current!, derived.today)
  const [date, setDate] = useState(derived.today)
  const ok = date >= w.earliest && date <= w.latest
  return (
    <Modal
      title="Salary arrived early?"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ok} onClick={() => void run(window.dailypot.startNextEarly(date), 'New cycle started').then((r) => r && onClose())}>
            Start new cycle
          </button>
        </>
      }
    >
      <p className="muted">
        Your scheduled payday is {formatDate(w.scheduledPayday, true)}. Starting early ends this cycle the day before, and the new cycle runs until the day before your next
        payday after that.
      </p>
      <Field label="Salary arrived on" error={ok ? null : `Pick a date from ${formatDate(w.earliest)} to ${formatDate(w.latest)}`}>
        <input className="input" type="date" value={date} min={w.earliest} max={w.latest} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </Modal>
  )
}
