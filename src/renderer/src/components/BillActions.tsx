/**
 * Mark paid / skip dialogs for an obligation instance (docs/06 F2, docs/09 §8 "Bills").
 * The split preview runs computePot over a hypothetical state; it is display-only and never stored.
 */
import { useMemo, useState } from 'react'
import { formatDate, formatMonth } from '@shared/dates'
import { computePot, instanceStatus, type Instance } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { AppState, ObligationPayment } from '@shared/schema'
import { BILL_STATUS as STATUS } from './billStatus'
import { Legend } from './Charts'
import { Chip, Field, Modal, Money, MoneyInput, useMoneyField } from './ui'
import { StackedBar } from './viz'
import { newId, useReady } from '../state/app'
import '../styles/pages/money.css'

/** The mono dateline + status chip shared by both dialogs. */
function InstanceHead({ instance, existing }: { instance: Instance; existing?: ObligationPayment }): React.JSX.Element {
  const { derived } = useReady()
  const status = instanceStatus(instance, existing, derived.today)
  return (
    <div className="pay-head">
      <p className="dateline">
        {formatMonth(instance.period)} · due {formatDate(instance.dueDate, true)}
      </p>
      <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>
    </div>
  )
}

export function PayDialog({
  instance,
  existing,
  onClose,
  onSaved
}: {
  instance: Instance
  existing?: ObligationPayment
  onClose: () => void
  /** Called once the payment is stored, right before the dialog closes (the bills ledger flashes the row). */
  onSaved?: () => void
}): React.JSX.Element {
  const { state, derived, run, toast } = useReady()
  const { today, currency, cycles } = derived
  const amount = useMoneyField(existing?.status === 'paid' ? existing.amount : instance.plannedAmount)
  const first = cycles[0]?.startDate ?? today
  const [pickedDate, setDate] = useState<string | null>(existing?.date ?? null)
  const date = pickedDate ?? today
  const [note, setNote] = useState(existing?.note ?? '')
  // One id for the preview and the save, so the preview replaces exactly the record being edited.
  const [id] = useState(() => existing?.id ?? newId())
  const amountValue = amount.value
  const valid = amountValue !== null && amountValue > 0 && date <= today && date >= first

  // Display-only split preview: what computePot would do with this payment in place. Never stored.
  const preview = useMemo(() => {
    if (!valid || amountValue === null) return null
    const item: ObligationPayment = {
      id,
      obligationId: instance.obligationId,
      period: instance.period,
      status: 'paid',
      date,
      amount: amountValue,
      createdAt: existing?.createdAt ?? 'preview'
    }
    const hypothetical: AppState = { ...state, obligationPayments: [...state.obligationPayments.filter((p) => p.id !== id), item] }
    return computePot(hypothetical, today).splits.get(id) ?? null
  }, [valid, amountValue, id, instance.obligationId, instance.period, date, existing?.createdAt, state, today])

  const save = async (): Promise<void> => {
    const item = {
      id,
      obligationId: instance.obligationId,
      period: instance.period,
      status: 'paid' as const,
      date,
      amount: amount.value!,
      ...(note.trim() ? { note: note.trim() } : {})
    }
    const r = await run(window.dailypot.upsert('obligationPayments', item))
    if (!r) return
    const split = computePot(r.state, r.meta.today).splits.get(item.id)
    if (split) {
      const c = state.settings.currency
      let msg = `${instance.name} paid · from pot ${formatMoney(split.fromPot, c)} · from main balance ${formatMoney(split.fromMain, c)}`
      if (split.fromMain > 0 && split.reserved > 0 && split.balanceBefore > 0) {
        msg += ` (${formatMoney(Math.min(split.reserved, split.balanceBefore), c)} of the pot is set aside for bills due sooner)`
      }
      toast(msg)
    }
    onSaved?.()
    onClose()
  }

  const shown = amountValue !== null && amountValue > 0 ? amountValue : instance.plannedAmount
  const reservedNote = preview && preview.fromMain > 0 && preview.reserved > 0 && preview.balanceBefore > 0 ? Math.min(preview.reserved, preview.balanceBefore) : null

  return (
    <Modal
      title={`Pay ${instance.name} — ${formatMonth(instance.period)}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => void save()}>
            Mark paid
          </button>
        </>
      }
    >
      <InstanceHead instance={instance} {...(existing ? { existing } : {})} />
      <div className="pay-figure">
        <span className="stat-label">{existing?.status === 'paid' ? 'Paying' : 'Bill amount'}</span>
        <span className="stat-value">
          <Money value={shown} currency={currency} />
        </span>
      </div>
      <p className="muted">The pot pays first (nearest due bills first); anything it can’t cover comes from your main balance.</p>
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`Amount (${currency})`} />
        <Field
          label="Paid on"
          error={date > today ? 'Can’t be in the future' : date < first ? 'Before you started tracking' : null}
          hint={`Any day from ${formatDate(first, true)}, your first tracked day, to today`}
        >
          <input className="input" type="date" value={date} max={today} min={first} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="pay-split">
        <span className="stat-label">Split preview</span>
        {preview ? (
          <>
            <StackedBar
              segments={[
                { key: 'pot', label: 'From pot', value: preview.fromPot, color: 'var(--series-1)' },
                { key: 'main', label: 'From main balance', value: preview.fromMain, color: 'var(--series-2)' }
              ]}
              total={preview.amount}
              height={10}
              delay={0}
              stagger={60}
              label={`From pot ${formatMoney(preview.fromPot, currency)}, from main balance ${formatMoney(preview.fromMain, currency)}`}
            />
            <Legend items={[{ label: 'from pot', color: 'var(--series-1)' }, { label: 'from main balance', color: 'var(--series-2)' }]} />
            <span className="pay-split-line">
              <span>from pot</span>
              <b>
                <Money value={preview.fromPot} currency={currency} />
              </b>
            </span>
            <span className="pay-split-line">
              <span>from main balance</span>
              <b>
                <Money value={preview.fromMain} currency={currency} />
              </b>
            </span>
            {reservedNote !== null ? (
              <p className="faint">
                <Money value={reservedNote} currency={currency} /> of the pot is set aside for bills due sooner, so this bill leans on your main balance.
              </p>
            ) : null}
          </>
        ) : (
          <p className="faint">Enter an amount above 0 and a date within your tracked range to preview the split.</p>
        )}
      </div>
    </Modal>
  )
}

export function SkipDialog({ instance, onClose }: { instance: Instance; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const [note, setNote] = useState('')
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('obligationPayments', {
        id: newId(),
        obligationId: instance.obligationId,
        period: instance.period,
        status: 'skipped',
        date: derived.today,
        amount: 0,
        ...(note.trim() ? { note: note.trim() } : {})
      }),
      `${instance.name} skipped for ${formatMonth(instance.period)}`
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={`Skip ${instance.name} for ${formatMonth(instance.period)}?`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Skip this month
          </button>
        </>
      }
    >
      <InstanceHead instance={instance} />
      <div className="pay-figure">
        <span className="stat-label">Planned amount</span>
        <span className="stat-value">
          <Money value={instance.plannedAmount} currency={derived.currency} />
        </span>
      </div>
      <p className="muted">Use this when the bill was waived, cancelled, or paid outside DailyPot. It won’t take money from the pot or hold any back.</p>
      <Field label="Reason (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by card before tracking" />
      </Field>
    </Modal>
  )
}
