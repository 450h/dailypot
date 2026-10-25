/** Day Strip ribbon (docs/09 §6.3): cycle progress, payday countdown, the strip, and the two cycle dialogs. */
import { useMemo, useState } from 'react'
import { diffDays, formatDate, type ISODate } from '@shared/dates'
import { cycleLength, earlyStartWindow } from '@shared/engine'
import type { Cycle } from '@shared/schema'
import type { Go } from '../../App'
import { stripDaysFor } from '../../components/stripDays'
import { Banner, Chip, Count, Field, Modal, Money, MoneyInput, Widget, useMoneyField } from '../../components/ui'
import { DayStrip } from '../../components/viz'
import { newId, useReady } from '../../state/app'

export function DayStripRibbon({
  cycle,
  onChangeAllowance,
  onEarlyStart,
  onAdd,
  onFocusQuickAdd,
  go
}: {
  cycle: Cycle
  onChangeAllowance: () => void
  onEarlyStart: () => void
  onAdd: (date: ISODate) => void
  onFocusQuickAdd: () => void
  go: Go
}): React.JSX.Element {
  const { derived, run } = useReady()
  const { pot, today, unlogged } = derived
  const { days: rows } = pot
  const dayNo = diffDays(cycle.startDate, today) + 1
  const len = cycleLength(cycle)
  const toPayday = diffDays(today, cycle.endDate) + 1
  const early = earlyStartWindow(cycle, today)
  // The one DayRow → cell mapping, shared with Pot history (components/stripDays.ts), so both pages agree on every cell.
  const days = useMemo(() => stripDaysFor(rows, cycle, today), [rows, cycle, today])

  const confirm = (date: ISODate): void => {
    void run(window.dailypot.upsert('confirmedDays', { id: newId(), date }), 'Day confirmed')
  }

  return (
    <Widget span={12} index={2} className="ribbon-widget">
      <div className="ribbon">
        <div className="stack ribbon-head" style={{ gap: 4 }}>
          <span className="eyebrow">
            Cycle {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
          </span>
          <span className="ribbon-day">
            Day {dayNo} of {len}
          </span>
          {unlogged.length === 0 ? (
            <Chip tone="ok" pop delay={1000}>
              Every day accounted for
            </Chip>
          ) : (
            <span className="faint">
              {unlogged.length} unlogged {unlogged.length === 1 ? 'day' : 'days'} to confirm below
            </span>
          )}
        </div>
        <DayStrip
          days={days}
          onPick={(date, state) => (state === 'today' ? onFocusQuickAdd() : go('pot', { date }))}
          onConfirm={confirm}
          onAdd={onAdd}
          progress={{ done: dayNo, total: len }}
          delay={350}
          label="Cycle days"
        />
        <div className="ribbon-right">
          {/* Counts down from the cycle length to the days left; a whole number, so ×100 like every <Count>. */}
          <Count value={toPayday * 100} integer hero="secondary" from={len * 100} delay={500} duration={600} />
          <span className="eyebrow">{toPayday === 1 ? 'day to payday' : 'days to payday'}</span>
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn sm" onClick={onChangeAllowance}>
              Change per-day
            </button>
            {early.allowed ? (
              <button type="button" className="btn sm" onClick={onEarlyStart}>
                Salary arrived early?
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </Widget>
  )
}

export function AllowanceDialog({ cycle, onClose }: { cycle: Cycle; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const field = useMoneyField(cycle.dailyAllowance)
  const closedDays = Math.max(0, diffDays(cycle.startDate, derived.today))
  const delta = field.value === null ? 0 : (field.value - cycle.dailyAllowance) * closedDays
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
        Applies to every day of the current cycle ({formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}), including days already passed. Next cycles start with the
        same amount.
      </p>
      <MoneyInput field={field} label={`Per-day (${derived.currency})`} allowZero />
      {delta !== 0 ? (
        <Banner tone={delta < 0 ? 'warn' : 'info'}>
          The pot changes by <Money value={delta} currency={derived.currency} signed /> now ({closedDays} past day(s) × <Money value={delta / Math.max(1, closedDays)} currency={derived.currency} signed />).
        </Banner>
      ) : null}
    </Modal>
  )
}

export function EarlyStartDialog({ cycle, onClose }: { cycle: Cycle; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const w = earlyStartWindow(cycle, derived.today)
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
