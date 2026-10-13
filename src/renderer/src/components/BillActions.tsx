/** Mark paid / skip dialogs for an obligation instance (docs/06 F2). */
import { useState } from 'react'
import { formatDate, formatMonth } from '@shared/dates'
import { computePot, type Instance } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { ObligationPayment } from '@shared/schema'
import { Field, Modal, MoneyInput, useMoneyField } from './ui'
import { newId, useReady } from '../state/app'

export function PayDialog({
  instance,
  existing,
  onClose
}: {
  instance: Instance
  existing?: ObligationPayment
  onClose: () => void
}): React.JSX.Element {
  const { state, derived, run, toast } = useReady()
  const amount = useMoneyField(existing?.status === 'paid' ? existing.amount : instance.plannedAmount)
  const first = derived.cycles[0]?.startDate ?? derived.today
  const [pickedDate, setDate] = useState<string | null>(existing?.date ?? null)
  const date = pickedDate ?? derived.today
  const [note, setNote] = useState(existing?.note ?? '')
  const valid = amount.value !== null && amount.value > 0 && date <= derived.today && date >= first

  const save = async (): Promise<void> => {
    const item = {
      id: existing?.id ?? newId(),
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
    onClose()
  }

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
      <p className="muted">Due {formatDate(instance.dueDate, true)}. The pot pays first (nearest due bills first); anything it can’t cover comes from your main balance.</p>
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`Amount (${derived.currency})`} />
        <Field label="Paid on" error={date > derived.today ? 'Can’t be in the future' : date < first ? 'Before you started tracking' : null}>
          <input className="input" type="date" value={date} max={derived.today} min={first} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
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
      <p className="muted">Use this when the bill was waived, cancelled, or paid outside DailyPot. It won’t take money from the pot or hold any back.</p>
      <Field label="Reason (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by card before tracking" />
      </Field>
    </Modal>
  )
}
