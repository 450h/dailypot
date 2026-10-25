/**
 * Extend tracking back (docs/05 §3, docs/09 §8 "Pot history"): add past cycles before the first one.
 * Every figure in the preview comes from the engine run over the would-be state (planExtendBack,
 * computePot, unloggedDays, allInstances); the dialog only formats. The write goes through
 * `window.dailypot.extendBack` and its result through `run()`; a FUTURE_DATE / INVALID answer is
 * shown on the start-date field instead of a toast.
 */
import { useMemo, useState } from 'react'
import { addDays, diffDays, formatDate, isValidDate, maxDate } from '@shared/dates'
import { MAX_EXTEND_BACK_DAYS, computePot, cycleEndFor, cycleLength, pastBillsToSkip, paydayOnOrBefore, planExtendBack, unloggedDays, validateExtendBack } from '@shared/engine'
import { useReady } from '../state/app'
import { Banner, Field, Modal, Money, MoneyInput, plural, useMoneyField } from './ui'
import '../styles/pages/history.css'

export function ExtendBackDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { cycles, today, currency } = derived
  const first = cycles[0]
  const payday = state.settings.payday
  const latest = first ? addDays(first.startDate, -1) : today
  const earliest = addDays(today, -MAX_EXTEND_BACK_DAYS)
  // Default: one whole cycle back (the payday on or before the day before the first cycle), never past the limit.
  const [startDate, setStartDate] = useState<string>(() => (first ? maxDate(earliest, paydayOnOrBefore(latest, payday)) : today))
  const allowance = useMoneyField(first?.dailyAllowance)
  const [confirmDays, setConfirmDays] = useState(true)
  const [skipPastBills, setSkipPastBills] = useState(true)
  const [serverErr, setServerErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dateErr = isValidDate(startDate) ? validateExtendBack(cycles, startDate, today) : 'Enter a date'
  const fieldErr = serverErr ?? dateErr
  const amount = allowance.value
  const ready = first !== undefined && dateErr === null && amount !== null && !allowance.invalid && !busy

  const preview = useMemo(() => {
    if (!first || dateErr !== null || amount === null) return null
    let n = 0
    const previewId = (): string => `preview-${n++}`
    const plan = planExtendBack(cycles, payday, startDate, amount, previewId)
    const lastDay = addDays(first.startDate, -1)
    // The engine over the would-be state: the old first cycle's opening pot and the days main would confirm.
    const pot = computePot({ ...state, cycles: [...plan, ...cycles] }, today)
    // Same engine function main uses for the write, so the preview and the result always agree.
    const pastBills = pastBillsToSkip(state.obligations, state.obligationPayments, startDate, lastDay, today)
    const last = plan.at(-1)
    return {
      plan,
      days: diffDays(startDate, first.startDate),
      opening: pot.cycleOpening.get(first.id) ?? 0,
      toConfirm: unloggedDays(pot, startDate, lastDay).length,
      pastBills,
      shortCycle: last && last.endDate !== cycleEndFor(last.startDate, payday) ? last : null
    }
  }, [first, dateErr, amount, cycles, payday, startDate, state, today])

  const save = async (): Promise<void> => {
    if (!ready || !first || amount === null) return
    setBusy(true)
    try {
      const r = await window.dailypot.extendBack({ startDate, dailyAllowance: amount, confirmDays, skipPastBills })
      if (!r.ok && (r.code === 'FUTURE_DATE' || r.code === 'INVALID')) {
        setServerErr(r.message)
        return
      }
      const ok = await run(Promise.resolve(r), `Tracking now starts on ${formatDate(startDate, true)}`)
      if (ok) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Extend tracking back"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!ready} onClick={() => void save()}>
            {busy ? 'Extending…' : 'Extend tracking'}
          </button>
        </>
      }
    >
      {!first ? (
        <p className="muted">There is no budget cycle yet. Finish setup first.</p>
      ) : (
        <div className="stack">
          <p className="muted">
            Start the pot timeline earlier so past spending, bills and cash flows count. Your existing cycles keep their dates and per-day; the added cycles use the per-day below and, like every closed cycle,
            can’t be edited afterwards.
          </p>
          <div className="grid grid-2">
            <Field label="New start date" error={fieldErr} hint={`Between ${formatDate(earliest, true)} (about 3 years back) and ${formatDate(latest, true)}`}>
              <input
                className="input mono"
                type="date"
                value={startDate}
                min={earliest}
                max={latest}
                aria-invalid={fieldErr !== null}
                onChange={(e) => {
                  setServerErr(null)
                  setStartDate(e.target.value)
                }}
              />
            </Field>
            <MoneyInput field={allowance} label={`Per-day for the added days (${currency})`} allowZero />
          </div>

          <label className="hx-check">
            <input type="checkbox" checked={confirmDays} onChange={(e) => setConfirmDays(e.target.checked)} />
            <span>
              Mark the added days as spent nothing
              <span className="faint">
                {preview
                  ? confirmDays
                    ? `${plural(preview.toConfirm, 'day')} with no spending recorded will be confirmed, so the pot history isn’t flooded with unlogged days.`
                    : `${plural(preview.toConfirm, 'day')} will show as unlogged; each still adds the full per-day to the pot until you add entries or confirm them.`
                  : 'Days without entries are confirmed as no-spend instead of showing as unlogged.'}
              </span>
            </span>
          </label>

          <label className="hx-check">
            <input type="checkbox" checked={skipPastBills} onChange={(e) => setSkipPastBills(e.target.checked)} />
            <span>
              Mark past bill months as skipped (paid before tracking)
              <span className="faint">
                {preview
                  ? preview.pastBills.length === 0
                    ? 'No unsettled bill months fall in the added range.'
                    : skipPastBills
                      ? `${plural(preview.pastBills.length, 'past bill month')} will be marked skipped (paid before tracking). A skip can be edited into a real payment later under Bills.`
                      : `Without this, those ${plural(preview.pastBills.length, 'month')} show as overdue: the pot reserves for them and your safe-to-spend drops until you settle them.`
                  : 'Bill months due in the added range, before today, are marked skipped; otherwise they show as overdue and lower your safe-to-spend.'}
              </span>
            </span>
          </label>

          {preview ? (
            <div className="hx-preview" aria-live="polite">
              <p className="dateline">
                PREVIEW · {plural(preview.days, 'DAY').toUpperCase()} · {plural(preview.plan.length, 'CYCLE').toUpperCase()}
              </p>
              <ul className="hx-plan" aria-label="Cycles that will be created">
                {preview.plan.map((c) => (
                  <li key={c.id}>
                    <span>
                      {formatDate(c.startDate, true)} – {formatDate(c.endDate, true)}
                    </span>
                    <span className="faint">{plural(cycleLength(c), 'day')}</span>
                  </li>
                ))}
                <li className="hx-existing">
                  <span>
                    {formatDate(first.startDate, true)} – {formatDate(first.endDate, true)}
                  </span>
                  <span className="faint">your current first cycle, unchanged</span>
                </li>
              </ul>
              {preview.shortCycle ? (
                <Banner tone="info">
                  Your first cycle started mid-month, so a short cycle ({formatDate(preview.shortCycle.startDate)} – {formatDate(preview.shortCycle.endDate)}, {plural(cycleLength(preview.shortCycle), 'day')}) fills
                  the gap right before it.
                </Banner>
              ) : null}
              <p className="muted">
                The pot on {formatDate(first.startDate, true)} {preview.opening === 0 ? <>stays at <Money value={0} currency={currency} /></> : <>starts at <Money value={preview.opening} currency={currency} signed /> instead of <Money value={0} /></>}
                : the added days’ per-day minus the daily spending already recorded on them, less any bill payments dated in that range.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
