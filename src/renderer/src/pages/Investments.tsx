/** F7 — Investments: what you've put into each stock and its current value (manual, ADR-0005). */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatDate } from '@shared/dates'
import { holdingFigures, portfolioTotals, type HoldingFigures } from '@shared/engine'
import type { Holding } from '@shared/schema'
import { Confirm, Empty, Field, Modal, Money, MoneyInput, UserText, useMoneyField } from '../components/ui'
import { newId, useReady } from '../state/app'

const pct = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)

const BASIS_LABEL: Record<HoldingFigures['basis'], string> = {
  valuation: '',
  estimated: 'estimated — update value',
  noValuation: 'no valuation yet',
  closed: 'closed'
}

export function Investments(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const [editing, setEditing] = useState<Holding | 'new' | null>(null)
  const [trade, setTrade] = useState<{ h: Holding; kind: 'buy' | 'sell' } | null>(null)
  const [valueOf, setValueOf] = useState<Holding | null>(null)
  const [history, setHistory] = useState<Holding | null>(null)
  const [del, setDel] = useState<Holding | null>(null)
  const rows = state.holdings.map((h) => holdingFigures(state, h))
  const totals = portfolioTotals(rows)
  const c = derived.currency

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Investments</h1>
          <p className="muted">Track what you’ve put into each stock or fund. DailyPot is offline, so you enter current values yourself.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          Add holding
        </button>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <span className="stat-label">Net invested</span>
          <span className="stat-value">
            <Money value={totals.netInvested} currency={c} />
          </span>
          <span className="stat-sub">Total bought minus total sold</span>
        </div>
        <div className="card">
          <span className="stat-label">Current value</span>
          <span className="stat-value">
            <Money value={totals.value} currency={c} />
          </span>
          <span className="stat-sub">From your latest valuations</span>
        </div>
        <div className="card">
          <span className="stat-label">Gain / loss</span>
          <span className={`stat-value ${totals.gain < 0 ? 'neg' : totals.gain > 0 ? 'pos' : ''}`}>
            <Money value={totals.gain} signed currency={c} />
          </span>
          <span className="stat-sub">{pct(totals.gainPct)}</span>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <Empty title="No holdings yet">
            <p>Add a stock or fund, then record what you buy and its current value from time to time.</p>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="r">Net invested</th>
                  <th className="r">Current value</th>
                  <th className="r">Gain / loss</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.holding.id}>
                    <td>
                      <UserText>{r.holding.name}</UserText>
                      {r.holding.symbol ? <span className="faint"> · {r.holding.symbol}</span> : null}
                      {r.holding.archived ? <span className="chip neutral"> archived</span> : null}
                    </td>
                    <td className="r">
                      <Money value={r.netInvested} />
                    </td>
                    <td className="r">
                      <Money value={r.value} />
                      <div className="faint">
                        {BASIS_LABEL[r.basis] || (r.valuationDate ? `as of ${formatDate(r.valuationDate, true)}` : '')}
                      </div>
                    </td>
                    <td className="r">
                      <Money value={r.gain} signed />
                      <div className="faint">{pct(r.gainPct)}</div>
                    </td>
                    <td className="r">
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm primary" onClick={() => setTrade({ h: r.holding, kind: 'buy' })}>
                          Buy
                        </button>
                        <button className="btn sm" onClick={() => setTrade({ h: r.holding, kind: 'sell' })}>
                          Sell
                        </button>
                        <button className="btn sm" onClick={() => setValueOf(r.holding)}>
                          Update value
                        </button>
                        <button className="btn sm ghost" onClick={() => setHistory(r.holding)}>
                          History
                        </button>
                        <button className="btn sm ghost" onClick={() => setEditing(r.holding)}>
                          Edit
                        </button>
                        <button className="btn sm ghost" aria-label="Delete" onClick={() => setDel(r.holding)}>
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint">Buying and selling here doesn’t touch the pot. Record the cash you put in or got out, in {c}.</p>
      </div>

      {editing ? <HoldingForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {trade ? <TradeForm holding={trade.h} kind={trade.kind} onClose={() => setTrade(null)} /> : null}
      {valueOf ? <ValueForm holding={valueOf} onClose={() => setValueOf(null)} /> : null}
      {history ? <HoldingHistory holding={history} onClose={() => setHistory(null)} /> : null}
      {del ? (
        <Confirm
          title={`Delete ${del.name}?`}
          message="This deletes the holding with all its buys, sells and valuations. Consider archiving instead."
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
  const { run } = useReady()
  const [name, setName] = useState(existing?.name ?? '')
  const [symbol, setSymbol] = useState(existing?.symbol ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [archived, setArchived] = useState(existing?.archived ?? false)
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
          <input className="input" maxLength={12} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="1120" />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="input" dir="auto" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {existing ? (
        <label className="row">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived (hidden from totals)
        </label>
      ) : null}
    </Modal>
  )
}

function TradeForm({ holding, kind, onClose }: { holding: Holding; kind: 'buy' | 'sell'; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const amount = useMoneyField()
  const [qty, setQty] = useState('')
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? derived.today
  const q = qty.trim() === '' ? undefined : Number(qty)
  const qtyBad = q !== undefined && (!Number.isFinite(q) || q <= 0)
  const valid = amount.value && !qtyBad && date <= derived.today
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
      <div className="grid grid-2">
        <MoneyInput field={amount} label={`${kind === 'buy' ? 'Amount invested' : 'Amount received'} (${derived.currency})`} autoFocus />
        <Field label="Quantity (optional)" error={qtyBad ? 'Must be a positive number' : null}>
          <input className="input num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ValueForm({ holding, onClose }: { holding: Holding; onClose: () => void }): React.JSX.Element {
  const { derived, run } = useReady()
  const value = useMoneyField()
  const [pickedDate, setDate] = useState<string | null>(null)
  const date = pickedDate ?? derived.today
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
          <button className="btn primary" disabled={value.value === null || date > derived.today} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <p className="muted">Check your broker app and enter what this holding is worth today.</p>
      <div className="grid grid-2">
        <MoneyInput field={value} label={`Value (${derived.currency})`} autoFocus allowZero />
        <Field label="As of">
          <input className="input" type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
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
        <table className="table">
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.date, true)}</td>
                <td>{e.label}</td>
                <td className="r">{e.label === 'Valuation' ? <Money value={e.amount} /> : <Money value={e.amount} signed />}</td>
                <td className="r">
                  <button className="btn sm ghost" aria-label="Delete" onClick={() => void run(window.dailypot.remove(e.col, e.id), 'Removed')}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
