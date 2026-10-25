/**
 * "My balance right now is …" (docs/05 §10, ADR-0007; docs/09 §6.1 and §8 Settings).
 * Shared by the dashboard masthead and Settings. Stores `settings.balanceAnchor` through settings:update
 * and never clamps: an INVALID answer from main is shown on the amount field.
 */
import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { anchorForBalanceNow, computeBalance } from '@shared/engine'
import type { BalanceAnchor } from '@shared/schema'
import { Field, MINUS, Modal, Money, MoneyInput, Seg, useMoneyField } from './ui'
import { useReady } from '../state/app'

type Sign = 'pos' | 'neg'

export function BalanceDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { balance, today, currency } = derived
  const anchor = state.settings.balanceAnchor
  // Prefill only when adjusting an existing anchor. Unanchored, the figure is the change since tracking started, not a
  // bank balance (docs/05 §10), so the field starts empty and Save stays disabled until the user types theirs.
  const field = useMoneyField(balance.anchored ? Math.abs(balance.balance) : undefined)
  const [sign, setSign] = useState<Sign>(balance.anchored && balance.balance < 0 ? 'neg' : 'pos')
  // null = today ("right now"); a past date means "at the start of that day".
  const [asOf, setAsOf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const date = asOf ?? today
  const future = date > today
  const amount = field.value === null ? null : sign === 'neg' ? -field.value : field.value
  const candidate: BalanceAnchor | null = amount === null || future ? null : date === today ? anchorForBalanceNow(state, today, amount) : { date, amount }
  // What the masthead will read after saving (the engine, run on the candidate): equals `amount` for today by construction.
  const preview = candidate && date !== today ? computeBalance({ ...state, settings: { ...state.settings, balanceAnchor: candidate } }, today).balance : null

  const save = async (): Promise<void> => {
    if (!candidate) return
    setBusy(true)
    setError(null)
    const call = window.dailypot.updateSettings({ balanceAnchor: candidate })
    const ok = await run(call, 'Balance set')
    setBusy(false)
    if (ok) {
      onClose()
      return
    }
    const r = await call
    if (!r.ok) setError(r.message)
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    const ok = await run(window.dailypot.updateSettings({ balanceAnchor: null }), 'Balance cleared')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title={balance.anchored ? 'Adjust your main balance' : 'Set your main balance'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {balance.anchored ? (
            <button className="btn danger" onClick={() => void clear()} disabled={busy}>
              Clear balance
            </button>
          ) : null}
          <button className="btn primary" disabled={!candidate || busy} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="stat-label">{balance.anchored ? 'DailyPot currently shows' : `Change since ${formatDate(balance.since ?? today, true)}`}</span>
        <span className="stat-value">
          <Money value={balance.balance} currency={currency} />
        </span>
        {anchor ? (
          <span className="faint">
            Anchored at the start of {formatDate(anchor.date, true)}: <Money value={anchor.amount} currency={currency} />
          </span>
        ) : (
          <span className="faint">Not anchored yet: this is only the change since you started tracking, not a bank balance.</span>
        )}
      </div>

      {/* The label follows the same branch as `candidate`: a past date stores the balance at the start of that day. */}
      <MoneyInput field={field} label={date < today ? `My balance at the start of ${formatDate(date, true)} was (${currency})` : `My balance right now is (${currency})`} allowZero />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <Seg<Sign>
        label="Sign"
        options={[
          { value: 'pos', label: 'In credit (+)' },
          { value: 'neg', label: `Overdrawn (${MINUS})` }
        ]}
        value={sign}
        onChange={setSign}
      />

      <details>
        <summary className="muted">As of a different date</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <Field label="My balance at the start of" error={future ? 'Can’t be in the future' : null}>
            <input className="input" type="date" value={date} max={today} onChange={(e) => setAsOf(e.target.value || null)} />
          </Field>
          <p className="faint">“At the start of” means before anything recorded on that day.</p>
          {preview !== null ? (
            <p className="muted">
              With everything recorded since, today’s balance will read <Money value={preview} currency={currency} />.
            </p>
          ) : null}
        </div>
      </details>

      <p className="muted">Income, expenses, bills, savings and investments you record from that date move this balance; DailyPot recalculates it from your history and never stores it.</p>
    </Modal>
  )
}
