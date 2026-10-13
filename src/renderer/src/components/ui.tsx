/** Small shared UI atoms. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { formatAmount, parseMoney, toDecimalString } from '@shared/money'
import { useApp } from '../state/app'

export function Money({ value, currency, signed, className }: { value: number; currency?: string; signed?: boolean; className?: string }): React.JSX.Element {
  const cls = signed ? (value < 0 ? 'neg' : value > 0 ? 'pos' : '') : ''
  const sign = signed && value > 0 ? '+' : ''
  return (
    <span className={`num ${cls} ${className ?? ''}`}>
      {sign}
      {formatAmount(value)}
      {currency ? <span className="faint"> {currency}</span> : null}
    </span>
  )
}

export function Field({ label, error, children, hint }: { label: string; error?: string | null; children: ReactNode; hint?: ReactNode }): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em className="err">{error}</em> : hint ? <em className="faint">{hint}</em> : null}
    </label>
  )
}

/** Controlled money input: holds text, reports minor units (or null if invalid/empty). */
export function useMoneyField(initialMinor?: number) {
  const [text, setText] = useState(initialMinor === undefined ? '' : toDecimalString(initialMinor))
  const value = text.trim() === '' ? null : parseMoney(text)
  const invalid = text.trim() !== '' && value === null
  return { text, setText, value, invalid, reset: (m?: number) => setText(m === undefined ? '' : toDecimalString(m)) }
}

export function MoneyInput({
  field,
  label,
  autoFocus,
  allowZero
}: {
  field: ReturnType<typeof useMoneyField>
  label: string
  autoFocus?: boolean
  allowZero?: boolean
}): React.JSX.Element {
  const zeroBad = !allowZero && field.value === 0
  return (
    <Field label={label} error={field.invalid ? 'Enter an amount like 70 or 70.50' : zeroBad ? 'Must be more than 0' : null}>
      <input
        className="input num"
        inputMode="decimal"
        autoFocus={autoFocus}
        value={field.text}
        onChange={(e) => field.setText(e.target.value)}
        aria-invalid={field.invalid || zeroBad}
        placeholder="0.00"
      />
    </Field>
  )
}

export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }): React.JSX.Element {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button')
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

export function Confirm({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Modal>
  )
}

export function Toasts(): React.JSX.Element {
  const { toasts, dismiss } = useApp()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          <span>{t.message}</span>
          <span className="row">
            {t.action ? (
              <button
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }): React.JSX.Element {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

export function ProgressBar({ value, big, label }: { value: number; big?: boolean; label: string }): React.JSX.Element {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={`bar ${big ? 'big' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Text that may be Arabic or English (docs/06: dir="auto"). */
export function UserText({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <span dir="auto" className={className}>
      {children}
    </span>
  )
}
