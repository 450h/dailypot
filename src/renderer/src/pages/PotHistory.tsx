/** F5 — Pot history: every day's delta and bill payments, so the pot is explainable. */
import { useState } from 'react'
import { formatDate, weekdayShort } from '@shared/dates'
import { Field, Money } from '../components/ui'
import { useReady } from '../state/app'

export function PotHistory(): React.JSX.Element {
  const { state, derived } = useReady()
  const { pot, cycles, currency } = derived
  const [cycleId, setCycleId] = useState(derived.current?.id ?? cycles.at(-1)?.id ?? '')
  const cycle = cycles.find((c) => c.id === cycleId)
  const names = new Map(state.obligations.map((o) => [o.id, o.name]))
  const days = pot.days.filter((d) => d.cycleId === cycleId).reverse()
  const opening = pot.cycleOpening.get(cycleId) ?? 0
  const closing = pot.cycleClosing.get(cycleId)
  const unlogged = days.filter((d) => d.unlogged).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pot history</h1>
          <p className="muted">Each closed day adds per-day − daily spending to the pot. Bills paid that day draw from the pot first, nearest due date first.</p>
        </div>
        <Field label="Cycle">
          <select className="input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {[...cycles].reverse().map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.startDate, true)} – {formatDate(c.endDate, true)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <span className="stat-label">Opening pot</span>
          <span className="stat-value">
            <Money value={opening} currency={currency} />
          </span>
          <span className="stat-sub">Rolled over from the previous cycle</span>
        </div>
        <div className="card">
          <span className="stat-label">{closing === null || closing === undefined ? 'Pot now' : 'Closing pot'}</span>
          <span className="stat-value">
            <Money value={closing ?? pot.balance} currency={currency} />
          </span>
          <span className="stat-sub">{closing === null || closing === undefined ? 'Cycle still open' : 'Carried into the next cycle'}</span>
        </div>
        <div className="card">
          <span className="stat-label">Unlogged days</span>
          <span className={`stat-value ${unlogged > 0 ? 'warn-text' : ''}`}>{unlogged}</span>
          <span className="stat-sub">Days with no spending recorded and not confirmed as no-spend — each added your full per-day.</span>
        </div>
      </div>

      <div className="card">
        {!cycle || days.length === 0 ? (
          <p className="muted">This cycle hasn’t started yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Per-day</th>
                  <th className="r">Daily spent</th>
                  <th className="r">Delta</th>
                  <th>Bill payments</th>
                  <th className="r">Pot after</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>
                      {weekdayShort(d.date)} {formatDate(d.date)}{' '}
                      {!d.closed ? <span className="chip info">today (projected)</span> : d.unlogged ? <span className="chip warn">unlogged</span> : d.confirmed ? <span className="chip neutral">✓ no spend</span> : null}
                    </td>
                    <td className="r">
                      <Money value={d.allowance} />
                    </td>
                    <td className="r">
                      <Money value={d.spent} />
                    </td>
                    <td className="r">
                      <Money value={d.delta} signed />
                    </td>
                    <td>
                      {d.payments.map((p) => (
                        <div key={p.paymentId} className="faint">
                          <span dir="auto">{names.get(p.obligationId) ?? 'Bill'}</span>: pot <Money value={p.fromPot} />
                          {p.fromMain > 0 ? (
                            <span className="warn-text">
                              {' '}
                              · main <Money value={p.fromMain} />
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </td>
                    <td className="r">
                      <strong>
                        <Money value={d.balanceAfter} className={d.balanceAfter < 0 ? 'neg' : ''} />
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint">All amounts in {currency}. Figures are recalculated from your history.</p>
      </div>
    </div>
  )
}
