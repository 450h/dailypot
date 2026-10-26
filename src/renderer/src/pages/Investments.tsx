/** F7 — Investments (manual, ADR-0005). Broadsheet layout (docs/09 §8 "Investments"; wording from docs/05 §7, §10). */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Ellipsis, Trash2 } from 'lucide-react'
import { formatDate } from '@shared/dates'
import { holdingFigures, portfolioTotals, type HoldingFigures } from '@shared/engine'
import { formatMoney } from '@shared/money'
import type { Holding } from '@shared/schema'
import { Legend } from '../components/Charts'
import { Cols, Confirm, Count, Chip, Empty, Field, FoldLine, IconButton, MINUS, Modal, Money, MoneyInput, PageHead, UserText, plural, useMoneyField, type CSSVars } from '../components/ui'
import { newId, useReady } from '../state/app'
import '../styles/pages/money.css'

/** `+12.3%` / `−4.0%` / `—` (display formatting of an engine ratio; U+2212 for negatives). */
const pct = (x: number | null): string => (x === null ? '—' : `${x < 0 ? MINUS : '+'}${Math.abs(x * 100).toFixed(1)}%`)

/** Basis notes exactly per docs/05 §7; `valuation` shows `as of <date>` instead. */
const BASIS_LABEL: Record<Exclude<HoldingFigures['basis'], 'valuation'>, string> = {
  estimated: 'estimated — update value',
  noValuation: 'no valuation yet',
  closed: 'closed'
}
const basisNote = (r: HoldingFigures): string => (r.basis === 'valuation' ? (r.valuationDate ? `as of ${formatDate(r.valuationDate, true)}` : '') : BASIS_LABEL[r.basis])

const gainGlyph = (gain: number): string => (gain > 0 ? '▲' : gain < 0 ? '▼' : '')
const gainTone = (gain: number): string => (gain > 0 ? 'pos' : gain < 0 ? 'neg' : '')

interface MenuItem {
  label: string
  onClick: () => void
  tone?: 'danger'
}

/**
 * Compact row actions behind a `⋯` button, shown by the container query at fold level 2 (≤ 620px, `.inv-menu` in money.css). `role="menu"` with `menuitem`s,
 * arrow/Home/End navigation, Escape closes and refocuses the trigger, outside click and scroll close.
 * Positioned fixed from the trigger's rect so `.table-wrap` never clips it.
 */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }): React.JSX.Element {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const menuId = useId()
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const close = (): void => setPos(null)
    const onDown = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        close()
        wrap.current?.querySelector<HTMLElement>('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (open) {
      setPos(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
  }

  const nav = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (els.length === 0) return
    const at = els.findIndex((el) => el === document.activeElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : e.key === 'ArrowDown' ? (at + 1) % els.length : (at - 1 + els.length) % els.length
    els[next]?.focus()
  }

  return (
    <span className="inv-menu" ref={wrap}>
      <button type="button" className="btn sm ghost icon-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={toggle}>
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {pos ? (
        <div className="menu-pop" role="menu" id={menuId} aria-label={label} style={{ top: pos.top, right: pos.right }} onKeyDown={nav}>
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`menu-item ${it.tone ?? ''}`}
              autoFocus={i === 0}
              onClick={() => {
                setPos(null)
                it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}

export function Investments(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { today, currency: c } = derived
  const [editing, setEditing] = useState<Holding | 'new' | null>(null)
  const [trade, setTrade] = useState<{ h: Holding; kind: 'buy' | 'sell' } | null>(null)
  const [valueOf, setValueOf] = useState<Holding | null>(null)
  const [history, setHistory] = useState<Holding | null>(null)
  const [del, setDel] = useState<Holding | null>(null)
  // `today` as the third argument: records dated after today are ignored (docs/05 §5 rule 8, clock safety).
  // Memoised per payload: the page's many dialog toggles must not rescan every holding record.
  const rows = useMemo(() => state.holdings.map((h) => holdingFigures(state, h, today)), [state, today])
  const totals = useMemo(() => portfolioTotals(rows), [rows])
  const activeCount = state.holdings.filter((h) => !h.archived).length
  const archivedCount = state.holdings.length - activeCount
  // Display scale for the paired bars: the largest invested/value figure on the page is the full width.
  const scale = Math.max(1, ...rows.flatMap((r) => [r.netInvested, r.value]))
  const width = (v: number): string => `${((Math.max(0, v) / scale) * 100).toFixed(2)}%`

  return (
    <div className="page">
      <PageHead
        dateline={`${plural(activeCount, 'holding')}${archivedCount ? ` · ${plural(archivedCount, 'archived')}` : ''} · valued by hand`}
        title="Investments"
        actions={
          <button className="btn primary" onClick={() => setEditing('new')}>
            Add holding
          </button>
        }
      />

      <div className="tiles inv-tiles">
        <div className="tile">
          <span className="stat-label">Net invested</span>
          <span className="stat-value">
            <Count value={totals.netInvested} currency={c} id="inv-net" delay={150} />
          </span>
          <span className="faint">Total bought minus total sold</span>
        </div>
        <div className="tile">
          <span className="stat-label">Current value</span>
          <span className="stat-value">
            <Count value={totals.value} currency={c} id="inv-value" delay={195} />
          </span>
          <span className="faint">From your latest valuations</span>
        </div>
        <div className="tile">
          <span className="stat-label">Gain / loss</span>
          <span className={`stat-value ${gainTone(totals.gain)}`}>
            {gainGlyph(totals.gain) ? (
              <span className="glyph" aria-hidden="true">
                {gainGlyph(totals.gain)}
              </span>
            ) : null}
            <Count value={totals.gain} signed currency={c} id="inv-gain" delay={240} />
          </span>
          <span className="faint">{pct(totals.gainPct)} on net invested</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <div>
            <h2>Holdings</h2>
            <p className="faint">Track what you’ve put into each stock or fund. DailyPot is offline, so you enter current values yourself.</p>
          </div>
          {rows.length > 0 ? <Legend items={[{ label: 'net invested', color: 'var(--series-1)' }, { label: 'current value', color: 'var(--series-3)' }]} /> : null}
        </div>
        {rows.length === 0 ? (
          <Empty title="No holdings yet">
            <p>Add a stock or fund, then record what you buy and its current value from time to time.</p>
            <button className="btn primary" onClick={() => setEditing('new')}>
              Add holding
            </button>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table inv-table">
              {/* Folding ledger (docs/09 §4.12): the bars fold under the holding at 880px, net invested at 620px. */}
              <Cols cols={['auto', ['auto', 1], ['num', 2], 128, 'delta', 'actions']} />
              <thead>
                <tr>
                  <th scope="col">Holding</th>
                  <th scope="col" data-fold="1">Invested vs value</th>
                  <th scope="col" className="r" data-fold="2">
                    Net invested
                  </th>
                  <th scope="col" className="r">Current value</th>
                  <th scope="col" className="r">Gain / loss</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const h = r.holding
                  const rowStyle: CSSVars = { '--t0': '350ms', '--j': i }
                  const barStyle: CSSVars = { '--t0': `${550 + i * 60}ms` }
                  // Rendered in its own column and again as a fold line; only one copy is ever displayed.
                  const bars = (
                    <div className="pair" role="img" aria-label={`net invested ${formatMoney(r.netInvested, c)}, current value ${formatMoney(r.value, c)}`} style={barStyle}>
                      <div className="pair-bar invested">
                        <span style={{ width: width(r.netInvested) }} />
                      </div>
                      <div className="pair-bar value">
                        <span style={{ width: width(r.value) }} />
                      </div>
                    </div>
                  )
                  const actions: MenuItem[] = [
                    { label: 'Buy', onClick: () => setTrade({ h, kind: 'buy' }) },
                    { label: 'Sell', onClick: () => setTrade({ h, kind: 'sell' }) },
                    { label: 'Update value', onClick: () => setValueOf(h) },
                    { label: 'History', onClick: () => setHistory(h) },
                    { label: 'Edit', onClick: () => setEditing(h) },
                    { label: 'Delete', onClick: () => setDel(h), tone: 'danger' }
                  ]
                  return (
                    <tr key={h.id} className="row-anim" style={rowStyle}>
                      <td className="inv-holding">
                        <UserText>{h.name}</UserText>
                        {h.symbol ? <span className="faint mono"> · {h.symbol}</span> : null}
                        {h.archived ? (
                          <>
                            {' '}
                            <Chip tone="neutral">archived</Chip>
                          </>
                        ) : null}
                        <FoldLine level={2}>
                          net invested <Money value={r.netInvested} />
                        </FoldLine>
                        <FoldLine level={1}>{bars}</FoldLine>
                      </td>
                      <td data-fold="1">{bars}</td>
                      <td className="r" data-fold="2">
                        <Count value={r.netInvested} id={`inv-${h.id}-net`} delay={420 + i * 40} />
                      </td>
                      <td className="r">
                        <Count value={r.value} id={`inv-${h.id}-value`} delay={420 + i * 40} />
                        {basisNote(r) ? <span className="basis">{basisNote(r)}</span> : null}
                      </td>
                      <td className={`r ${gainTone(r.gain)}`}>
                        {gainGlyph(r.gain) ? (
                          <span className="glyph" aria-hidden="true">
                            {gainGlyph(r.gain)}{' '}
                          </span>
                        ) : null}
                        <Count value={r.gain} signed id={`inv-${h.id}-gain`} delay={420 + i * 40} />
                        <span className="basis">{pct(r.gainPct)}</span>
                      </td>
                      <td className="r">
                        <span className="inv-actions">
                          <button className="btn sm primary" onClick={() => setTrade({ h, kind: 'buy' })}>
                            Buy
                          </button>
                          <button className="btn sm" onClick={() => setTrade({ h, kind: 'sell' })}>
                            Sell
                          </button>
                          <button className="btn sm" onClick={() => setValueOf(h)}>
                            Update value
                          </button>
                          <button className="btn sm ghost" onClick={() => setHistory(h)}>
                            History
                          </button>
                          <button className="btn sm ghost" onClick={() => setEditing(h)}>
                            Edit
                          </button>
                          <IconButton label="Delete" tone="danger" size="sm" onClick={() => setDel(h)}>
                            <Trash2 size={15} aria-hidden="true" />
                          </IconButton>
                        </span>
                        <RowMenu label={`Actions for ${h.name}`} items={actions} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint">Buying and selling here doesn’t touch the pot. Record the cash you put in or got out, in {c}. Archived holdings are closed and stay out of the totals.</p>
      </div>

      {editing ? <HoldingForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {trade ? <TradeForm holding={trade.h} kind={trade.kind} onClose={() => setTrade(null)} /> : null}
      {valueOf ? <ValueForm holding={valueOf} onClose={() => setValueOf(null)} /> : null}
      {history ? <HoldingHistory holding={history} onClose={() => setHistory(null)} /> : null}
      {del ? (
        <Confirm
          title={`Delete ${del.name}?`}
          message={
            <>
              <p>This deletes the holding with all its buys, sells and valuations ({formatMoney(holdingFigures(state, del, today).value, c)} current value). The history is gone for good.</p>
              <p>Prefer archiving (Edit → Archived) to keep the history: a closed holding stops counting in your net worth, which drops by its current value.</p>
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => void run(window.dailypot.remove('holdings', del.id), 'Holding deleted')}
          onClose={() => setDel(null)}
        />
      ) : null}
    </div>
  )
}

function HoldingForm({ existing, onClose }: { existing: Holding | undefined; onClose: () => void }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { today, currency } = derived
  const [name, setName] = useState(existing?.name ?? '')
  const [symbol, setSymbol] = useState(existing?.symbol ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [archived, setArchived] = useState(existing?.archived ?? false)
  const value = existing ? holdingFigures(state, existing, today).value : 0
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('holdings', {
        id: existing?.id ?? newId(),
        name: name.trim(),
        archived,
        ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
        ...(note.trim() ? { note: note.trim() } : {})
      }),
      'Holding saved'
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={existing ? 'Edit holding' : 'Add holding'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label="Name">
          <input className="input" dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Al Rajhi Bank" />
        </Field>
        <Field label="Symbol (optional)">
          <input className="input mono" maxLength={12} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="1120" />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {existing ? (
        <div className="stack" style={{ gap: 4 }}>
          <label className="row">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
          </label>
          <p className="faint">
            Archived = closed. The holding stops counting in your net worth, which drops by its current value ({formatMoney(value, currency)}); its buys and sells stay recorded as cash that left your main balance. It also leaves the portfolio totals above.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}

function TradeForm({ holding, kind, onClose }: { holding: Holding; kind: 'buy' | 'sell'; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const { today, currency } = derived
  const amount = useMoneyField()
  const [qty, setQty] = useState('')
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? today
  const q = qty.trim() === '' ? undefined : Number(qty)
  const qtyBad = q !== undefined && (!Number.isFinite(q) || q <= 0)
  const valid = amount.value && !qtyBad && date <= today
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('holdingTransactions', { id: newId(), holdingId: holding.id, date, kind, amount: amount.value!, ...(q !== undefined ? { quantity: q } : {}) }),
      kind === 'buy' ? 'Buy recorded' : 'Sell recorded'
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={`${kind === 'buy' ? 'Buy' : 'Sell'} ${holding.name}`}
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
      <p className="muted">{kind === 'buy' ? 'Cash that left your main balance for this holding.' : 'Cash that came back to your main balance from this holding.'}</p>
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`${kind === 'buy' ? 'Amount invested' : 'Amount received'} (${currency})`} autoFocus />
        <Field label="Quantity (optional)" error={qtyBad ? 'Must be a positive number' : null}>
          <input className="input num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Date" error={date > today ? 'Can’t be in the future' : null}>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ValueForm({ holding, onClose }: { holding: Holding; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const { today, currency } = derived
  const value = useMoneyField()
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? today
  const save = async (): Promise<void> => {
    const ok = await run(window.dailypot.upsert('holdingValuations', { id: newId(), holdingId: holding.id, date, value: value.value! }), 'Value updated')
    if (ok) onClose()
  }
  return (
    <Modal
      title={`Current value of ${holding.name}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={value.value === null || date > today} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <p className="muted">Check your broker app and enter what this holding is worth today.</p>
      <div className="grid grid-2">
        <MoneyInput field={value} label={`Value (${currency})`} autoFocus allowZero />
        <Field label="As of" error={date > today ? 'Can’t be in the future' : null}>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function HoldingHistory({ holding, onClose }: { holding: Holding; onClose: () => void }): React.JSX.Element {
  const { state, run } = useReady()
  const events = [
    ...state.holdingTransactions.filter((t) => t.holdingId === holding.id).map((t) => ({ id: t.id, date: t.date, label: t.kind === 'buy' ? 'Buy' : 'Sell', amount: t.kind === 'buy' ? t.amount : -t.amount, col: 'holdingTransactions' as const })),
    ...state.holdingValuations.filter((v) => v.holdingId === holding.id).map((v) => ({ id: v.id, date: v.date, label: 'Valuation', amount: v.value, col: 'holdingValuations' as const }))
  ].sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <Modal title={`${holding.name} — history`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      {events.length === 0 ? (
        <p className="muted">Nothing recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <Cols cols={[104, 'auto', 'num', 48]} />
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Event</th>
                <th scope="col" className="r">Amount</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{formatDate(e.date, true)}</td>
                  <td>{e.label}</td>
                  <td className="r">{e.label === 'Valuation' ? <Money value={e.amount} /> : <Money value={e.amount} signed />}</td>
                  <td className="r">
                    <IconButton label="Delete" tone="danger" size="sm" onClick={() => void run(window.dailypot.remove(e.col, e.id), 'Removed')}>
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
