/**
 * Shared UI atoms (docs/09 "Broadsheet"; reference in docs/10-renderer-components.md).
 * Every existing export keeps its props. No business rules here: figures arrive as integer minor units
 * from src/shared/engine and are formatted only through src/shared/money.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatAmount, parseMoney, toDecimalString } from '@shared/money'
import { useCountUp } from '../hooks/useCountUp'
import { useToasts } from '../state/app'

/** Inline style that may carry CSS custom properties (`--span`, `--i`, …). */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>

/** True minus (U+2212) for display; `formatAmount` emits a hyphen-minus for CSV/inputs. */
export const MINUS = '−'
export const displayAmount = (minor: number): string => (minor < 0 ? MINUS + formatAmount(-minor) : formatAmount(minor))

/** `3 days`, `1 bill`: count + word with a plural `s`. */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const moneyClass = (value: number, signed: boolean | undefined): string => (value < 0 ? 'neg' : signed && value > 0 ? 'pos' : '')

export function Money({ value, currency, signed, className }: { value: number; currency?: string; signed?: boolean; className?: string }): React.JSX.Element {
  const sign = signed && value > 0 ? '+' : ''
  return (
    <span className={`num ${moneyClass(value, signed)} ${className ?? ''}`}>
      {sign}
      {displayAmount(value)}
      {currency ? <span className="faint"> {currency}</span> : null}
    </span>
  )
}

/** Width units a numeral needs: 1 per digit, ~0.3 per separator (tabular digits = width of "0"). */
const lockUnits = (text: string): number => {
  const digits = (text.match(/\d/g) ?? []).length
  return digits + (text.length - digits) * 0.3
}

/**
 * `min-width` for the digit box (docs/09 §3): while counting, the wider of the start and final strings, because
 * a re-count may lose a digit on the way (100.00 → 95.00); once settled 0, so the box eases to its natural width
 * (`.count-digits` transitions `min-width`) instead of snapping mid-count.
 */
const lockStyle = (settled: boolean, startText: string, finalText: string): CSSProperties => ({
  minWidth: settled ? 0 : `${Math.max(lockUnits(startText), lockUnits(finalText)).toFixed(1)}ch`
})

/**
 * The counting numeral (docs/09 §3, §7.3). Same final text as <Money>: `210.00 SAR`.
 * Default: `.count.num` (use inside `.stat-value`, `.tile-hero`, table cells).
 * `hero`: `.hero-value` with the minor units at 0.42em (`.hero-minor`) and the currency as `.cur`;
 * `hero="secondary"`: the same split at 40px (`.hero-2`). `data-settled="true"` once the count finished.
 * `integer`: a plain whole number (entries, days to payday); pass it ×100 like every other value.
 * The only caller of `useCountUp`: a page that hoists the hook re-renders everything under it every frame.
 * Never render inside a Modal (counts pause behind an open dialog) — use <Money> there.
 */
export function Count({
  value,
  currency,
  signed,
  hero,
  integer,
  id,
  delay,
  duration,
  from,
  className
}: {
  value: number
  currency?: string
  signed?: boolean
  hero?: boolean | 'secondary'
  integer?: boolean
  id?: string
  delay?: number
  duration?: number
  from?: number
  className?: string
}): React.JSX.Element {
  const { value: shown, settled, from: origin } = useCountUp(value, { ...(id ? { id } : {}), ...(delay !== undefined ? { delay } : {}), ...(duration !== undefined ? { duration } : {}), ...(from !== undefined ? { from } : {}) })
  const fmt = (minor: number): string => (integer ? String(Math.round(minor / 100)) : (signed && minor > 0 ? '+' : '') + displayAmount(minor))
  const finalText = fmt(value)
  const text = fmt(shown)
  const startText = fmt(origin)
  const cls = integer ? '' : moneyClass(value, signed)
  const cur = integer ? undefined : currency
  const srFinal = settled ? null : <span className="sr-only">{cur ? `${finalText} ${cur}` : finalText}</span>

  if (hero) {
    const [intPart = '', minor = '00'] = text.split('.')
    const [finalInt = ''] = finalText.split('.')
    const [startInt = ''] = startText.split('.')
    const long = (finalInt.match(/\d/g) ?? []).length >= 8
    return (
      <span className={`${hero === 'secondary' ? 'hero-2' : 'hero-value'} count num ${cls} ${className ?? ''}`} data-settled={settled ? 'true' : 'false'} data-len={long ? 'long' : undefined}>
        <span aria-hidden={settled ? undefined : true}>
          <span className="count-digits" style={lockStyle(settled, startInt, finalInt)}>
            {intPart}
          </span>
          {integer ? null : <span className="hero-minor">.{minor}</span>}
          {cur ? <span className="cur">{cur}</span> : null}
        </span>
        {srFinal}
      </span>
    )
  }
  return (
    <span className={`count num ${cls} ${className ?? ''}`} data-settled={settled ? 'true' : 'false'}>
      <span aria-hidden={settled ? undefined : true}>
        <span className="count-digits" style={lockStyle(settled, startText, finalText)}>
          {text}
        </span>
        {cur ? <span className="faint"> {cur}</span> : null}
      </span>
      {srFinal}
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

/** Dialogs currently open, so a dialog opened from another (a Confirm inside a flow) keeps the page inert until the last one closes. */
let openDialogs = 0
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog (docs/09 §4.13, §9.2): `aria-modal`, initial focus, a Tab/Shift+Tab trap, the page behind made `inert`
 * while any dialog is open, Escape closes, focus returns to the opener on close.
 */
export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }): React.JSX.Element {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  // Once per mount. Deliberately not keyed on `onClose` (callers pass a fresh arrow every render): a re-render behind
  // the dialog, such as a toast expiring, must never move focus away from the field being typed in.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // The overlay is portalled to <body>, so #root (sidebar, page, toasts) is a sibling: inert takes it out of the
    // tab order and the accessibility tree without touching the dialog.
    const root = document.getElementById('root')
    if (openDialogs++ === 0) root?.setAttribute('inert', '')
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const onTab = (e: KeyboardEvent): void => {
      const dialog = ref.current
      if (e.key !== 'Tab' || !dialog) return
      // Only the topmost dialog traps (overlays sit under <body> in opening order).
      const overlays = document.querySelectorAll('.overlay')
      if (overlays[overlays.length - 1] !== dialog.parentElement) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) {
        e.preventDefault()
        return
      }
      const active = document.activeElement
      const inside = active !== null && dialog.contains(active)
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onTab)
    return () => {
      window.removeEventListener('keydown', onTab)
      // Un-inert before restoring focus: an inert ancestor makes `prev` unfocusable.
      if (--openDialogs === 0) root?.removeAttribute('inert')
      prev?.focus()
    }
  }, [])
  // Escape calls the latest handler; re-subscribing when it changes is cheap and has no focus side effect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Portalled to <body>: a fixed overlay inside an animated page or a contained widget would be positioned by that ancestor.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body
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
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          <span>{t.message}</span>
          <span className="row" style={{ flexWrap: 'nowrap' }}>
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

/**
 * Meter (docs/09 §4.9). `tone` picks the ramp (track = lighter step of the same ramp). `anim` grows the fill
 * from the left (`--t0` = start delay in ms). The surrounding text must state `x / y` in words.
 */
export function ProgressBar({
  value,
  big,
  label,
  tone,
  anim,
  delay
}: {
  value: number
  big?: boolean
  label: string
  tone?: 'accent' | 'ok' | 'warn' | 'neg'
  anim?: boolean
  delay?: number
}): React.JSX.Element {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const style: CSSVars | undefined = anim ? { '--t0': `${delay ?? 0}ms` } : undefined
  return (
    <div
      className={`bar ${big ? 'big' : ''} ${tone && tone !== 'accent' ? tone : ''} ${anim ? 'anim' : ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={style}
    >
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Text that may be Arabic or English (docs/06: dir="auto"). Never uppercase or track user text. */
export function UserText({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <span dir="auto" className={className}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------
   Broadsheet atoms
   ------------------------------------------------------------------------------------------------ */

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent'

const CHIP_GLYPH: Record<Tone, string> = { ok: '✓', warn: '●', danger: '!', info: '→', neutral: '–', accent: '●' }

/**
 * Status chip (docs/09 §4.8): glyph in an aria-hidden span + a plain word, so `getByText('Due today')` matches.
 * Default glyphs by tone: ok ✓ · warn ● · danger ! · info → · neutral – · accent ●. `pop` plays the
 * 260ms `--ease-pop` entrance (`delay` in ms).
 */
export function Chip({ tone = 'neutral', glyph, pop, delay, title, children }: { tone?: Tone; glyph?: string; pop?: boolean; delay?: number; title?: string; children: ReactNode }): React.JSX.Element {
  const style: CSSVars | undefined = pop ? { '--t0': `${delay ?? 0}ms` } : undefined
  return (
    <span className={`chip ${tone} ${pop ? 'pop' : ''}`} style={style} title={title}>
      <span className="glyph" aria-hidden="true">
        {glyph ?? CHIP_GLYPH[tone]}
      </span>
      {children}
    </span>
  )
}

/** Eyebrow + 28px value + sub line (docs/09 §3). `ruled` puts the eyebrow on a 2px rule. */
export function Stat({ label, value, sub, tone, ruled, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn-text'; ruled?: boolean; className?: string }): React.JSX.Element {
  return (
    <div className={`stat ${className ?? ''}`}>
      <span className={`stat-label ${ruled ? 'ruled' : ''}`}>{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
      {sub !== undefined && sub !== null ? <span className="stat-sub">{sub}</span> : null}
    </div>
  )
}

/**
 * Bento cell (docs/09 §5.4, §6). `span` is the 12-column width at ≥ 1100px, `spanCompact` below it
 * (defaults to 12); `index` is the stagger order (`--i`, 45ms apart from 150ms). Only `.widget-body`
 * animates, so borders never flash. `variant`: card (default) · masthead (rule band, no box) · flat (no box).
 */
export function Widget({
  span,
  spanCompact = 12,
  index,
  title,
  subtitle,
  actions,
  variant = 'card',
  className,
  id,
  children
}: {
  span: number
  spanCompact?: number
  index: number
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  variant?: 'card' | 'masthead' | 'flat'
  className?: string
  id?: string
  children: ReactNode
}): React.JSX.Element {
  const style: CSSVars = { '--span': span, '--span-c': spanCompact, '--i': index }
  const variantCls = variant === 'card' ? 'card' : variant === 'masthead' ? 'masthead' : 'flat'
  return (
    <section className={`widget ${variantCls} ${className ?? ''}`} style={style} id={id}>
      <div className="widget-body">
        {title !== undefined ? (
          <div className="card-title">
            <div>
              {typeof title === 'string' ? <h2>{title}</h2> : title}
              {subtitle ? <p className="faint">{subtitle}</p> : null}
            </div>
            {actions ? <span className="row" style={{ flexWrap: 'nowrap' }}>{actions}</span> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  )
}

/** Segmented control (docs/09 §4.11): `role="group"` + `aria-pressed` buttons. */
export function Seg<T extends string>({ label, options, value, onChange, size }: { label: string; options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; size?: 'sm' }): React.JSX.Element {
  return (
    <div className={`seg ${size ?? ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Square ghost button for an icon; `label` is the accessible name and tooltip. */
export function IconButton({ label, onClick, children, tone, size, disabled }: { label: string; onClick: () => void; children: ReactNode; tone?: 'danger'; size?: 'sm'; disabled?: boolean }): React.JSX.Element {
  return (
    <button type="button" className={`btn ghost icon-btn ${size ?? ''} ${tone ?? ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/**
 * Signed change (docs/09 §3): ▲/▼ glyph + sign + amount, `pos`/`neg` by whether it is good.
 * `lowerIsBetter` flips the colouring (spending down = good). Zero renders as a neutral `— 0.00`.
 */
export function Delta({ value, lowerIsBetter, currency, className }: { value: number; lowerIsBetter?: boolean; currency?: string; className?: string }): React.JSX.Element {
  if (value === 0)
    return (
      <span className={`delta num muted ${className ?? ''}`}>
        <span className="glyph" aria-hidden="true">
          —
        </span>
        {displayAmount(0)}
        {currency ? <span className="faint"> {currency}</span> : null}
      </span>
    )
  const up = value > 0
  const good = lowerIsBetter ? !up : up
  return (
    <span className={`delta num ${good ? 'pos' : 'neg'} ${className ?? ''}`}>
      <span className="glyph" aria-hidden="true">
        {up ? '▲' : '▼'}
      </span>
      {up ? '+' : ''}
      {displayAmount(value)}
      {currency ? <span className="faint"> {currency}</span> : null}
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------
   Folding ledger (docs/09 §4.12)
   ------------------------------------------------------------------------------------------------ */

/**
 * A column width: px, a percentage, `auto` (shares what the fixed columns leave), or a preset from app.css:
 * `num` (−10,000,000.00 at 13px tabular) · `delta` (▲ +10,000,000.00) · `date` (mono 2026-10-24) ·
 * `actions` (`--col-actions`, narrowing to `--col-actions-1` / `-2` at the folds; override on `.table.x`).
 */
export type ColWidth = number | `${number}%` | 'auto' | 'num' | 'delta' | 'date' | 'actions'
/** A column of a `<Cols>` declaration: its width, or `[width, level]` when it folds into the primary cell at that level. */
export type ColSpec = ColWidth | readonly [ColWidth, 1 | 2]

/**
 * The `<colgroup>` every `.table` declares (`table-layout: fixed`): the table can never be wider than its
 * `.table-wrap` container. A folding column's `<col>` carries `data-fold`, as must its `<th>` and `<td>`s;
 * render the same information in the row's primary cell with `<FoldLine level>`.
 */
export function Cols({ cols }: { cols: ReadonlyArray<ColSpec> }): React.JSX.Element {
  return (
    <colgroup>
      {cols.map((c, i) => {
        const [w, fold] = Array.isArray(c) ? (c as readonly [ColWidth, 1 | 2]) : ([c as ColWidth, undefined] as const)
        const preset = typeof w === 'string' && w !== 'auto' && !w.endsWith('%') ? w : undefined
        const style: CSSProperties | undefined = typeof w === 'number' || (typeof w === 'string' && w.endsWith('%')) ? { width: w } : undefined
        return <col key={i} className={preset ? `c-${preset}` : undefined} style={style} data-fold={fold} />
      })}
    </colgroup>
  )
}

/** A folded column's information inside the row's primary cell: hidden until the column at `level` folds away. */
export function FoldLine({ level, className, children }: { level: 1 | 2; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <span className={`fold-line ${className ?? ''}`} data-fold={level}>
      {children}
    </span>
  )
}

/** Page header idiom (docs/09 §5.3): sticky glass, the mono uppercase `.dateline` above the h1, actions on the right. */
export function PageHead({ dateline, title, actions }: { dateline?: ReactNode; title: ReactNode; actions?: ReactNode }): React.JSX.Element {
  return (
    <header className="page-head">
      <div>
        {dateline ? <p className="dateline">{dateline}</p> : null}
        <h1>{title}</h1>
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  )
}

/** Banner / nudge (docs/09 §4.14): body text, 3px status bar, leading glyph. Children = message; `actions` on the right. */
export function Banner({ tone, children, actions, role }: { tone: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; actions?: ReactNode; role?: 'status' | 'alert' }): React.JSX.Element {
  const glyph = tone === 'info' ? 'ℹ' : tone === 'warn' ? '⚠' : tone === 'danger' ? '!' : '✓'
  return (
    <div className={`banner ${tone}`} role={role}>
      <span>
        <span className="glyph" aria-hidden="true">
          {glyph}
        </span>
        {children}
      </span>
      {actions ? <span className="row" style={{ flexWrap: 'nowrap' }}>{actions}</span> : null}
    </div>
  )
}
