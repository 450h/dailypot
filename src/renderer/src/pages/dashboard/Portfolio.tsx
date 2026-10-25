/** Savings goals (docs/09 §6.11) and investments (§6.12) on the dashboard. */
import { useMemo } from 'react'
import { formatDate } from '@shared/dates'
import { goalFigures, holdingFigures, portfolioTotals, type HoldingFigures } from '@shared/engine'
import type { Go } from '../../App'
import { Legend, SERIES } from '../../components/Charts'
import { Count, MINUS, Money, ProgressBar, Stat, UserText, Widget, type CSSVars } from '../../components/ui'
import { useReady } from '../../state/app'

const GOALS_T0 = 750
const INV_T0 = 800

export function GoalsWidget({ go }: { go: Go }): React.JSX.Element {
  const { state, derived } = useReady()
  const { today, currency, netWorth: nw } = derived
  const rows = useMemo(
    () =>
      state.goals
        .filter((g) => !g.archived)
        .map((g) => goalFigures(state, g, today))
        .sort((a, b) => b.saved - a.saved),
    [state, today]
  )
  const shown = rows.slice(0, 4)
  return (
    <Widget
      span={4}
      spanCompact={12}
      index={10}
      title="Savings goals"
      className="goals-widget"
      actions={
        <button type="button" className="btn sm ghost" onClick={() => go('goals')}>
          {rows.length > 4 ? 'all goals →' : 'Goals →'}
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="muted">No savings goals yet. Create one under Savings goals and every contribution counts toward your net worth.</p>
      ) : (
        <>
          <Stat label="Saved so far" value={<Count value={nw.savings} currency={currency} id="goals-saved" delay={GOALS_T0} />} />
          <ul className="goal-list">
            {shown.map((r, j) => {
              const reached = r.saved >= r.goal.targetAmount
              const style: CSSVars = { '--t0': `${GOALS_T0}ms`, '--j': j }
              return (
                <li key={r.goal.id} className="goal-row row-anim" style={style}>
                  <span className="row-between">
                    <UserText className="goal-name">{r.goal.name}</UserText>
                    <span className="meter-text">
                      <Money value={r.saved} /> / <Money value={r.goal.targetAmount} />
                    </span>
                  </span>
                  <ProgressBar value={r.progress} label={`${r.goal.name} progress`} tone={reached ? 'ok' : 'accent'} anim delay={GOALS_T0 + j * 40 + 360} />
                  <span className="faint">
                    {reached ? (
                      <>
                        <span aria-hidden="true">✓</span> Reached
                      </>
                    ) : r.neededPerMonth !== null ? (
                      <>
                        save about <Money value={r.neededPerMonth} /> per month
                      </>
                    ) : r.targetPassed ? (
                      'target date passed'
                    ) : (
                      'no target date'
                    )}{' '}
                    · {Math.round(r.progress * 100)}%
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Widget>
  )
}

function basisNote(r: HoldingFigures): string {
  switch (r.basis) {
    case 'valuation':
      return r.valuationDate ? `as of ${formatDate(r.valuationDate)}` : 'valued'
    case 'estimated':
      return r.valuationDate ? `estimated · as of ${formatDate(r.valuationDate)}` : 'estimated'
    case 'noValuation':
      return 'no valuation yet'
    case 'closed':
      return 'closed'
  }
}

export function InvestmentsWidget({ go }: { go: Go }): React.JSX.Element {
  const { state, derived } = useReady()
  const { today } = derived
  const rows = useMemo(() => state.holdings.filter((h) => !h.archived).map((h) => holdingFigures(state, h, today)), [state, today])
  const totals = useMemo(() => portfolioTotals(rows), [rows])
  const top = useMemo(() => [...rows].sort((a, b) => b.value - a.value).slice(0, 4), [rows])
  const scale = Math.max(1, ...top.map((r) => Math.max(r.value, r.netInvested)))
  const pct = totals.gainPct === null ? null : `${totals.gainPct >= 0 ? '+' : MINUS}${Math.abs(totals.gainPct * 100).toFixed(1)}%`

  return (
    <Widget
      span={6}
      spanCompact={12}
      index={11}
      title="Investments"
      className="inv-widget"
      actions={
        <button type="button" className="btn sm ghost" onClick={() => go('investments')}>
          All holdings →
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="muted">No holdings yet. Add one under Investments; buys count as cash that left your main balance.</p>
      ) : (
        <>
          <div className="tiles">
            <div className="tile">
              <span className="eyebrow">Net invested</span>
              <span className="tile-hero">
                <Count value={totals.netInvested} id="inv-net" delay={INV_T0} duration={800} />
              </span>
            </div>
            <div className="tile">
              <span className="eyebrow">Current value</span>
              <span className="tile-hero">
                <Count value={totals.value} id="inv-value" delay={INV_T0} duration={800} />
              </span>
            </div>
            <div className="tile">
              <span className="eyebrow">Gain / loss</span>
              <span className={`tile-hero ${totals.gain < 0 ? 'neg' : totals.gain > 0 ? 'pos' : ''}`}>
                <span className="glyph" aria-hidden="true">
                  {totals.gain < 0 ? '▼' : totals.gain > 0 ? '▲' : '—'}
                </span>{' '}
                <Count value={totals.gain} signed id="inv-gain" delay={INV_T0} duration={800} />
                {pct ? <span className="faint"> {pct}</span> : null}
              </span>
            </div>
          </div>
          <Legend
            items={[
              { label: 'invested', color: SERIES[0] },
              { label: 'value', color: SERIES[2] }
            ]}
          />
          <ul className="inv-list">
            {top.map((r, j) => {
              const style: CSSVars = { '--t0': `${INV_T0}ms`, '--j': j }
              const barStyle: CSSVars = { '--t0': `${INV_T0 + 300 + j * 60}ms` }
              return (
                <li key={r.holding.id} className="inv-row row-anim" style={style}>
                  <span className="row-between">
                    <UserText className="goal-name">{r.holding.name}</UserText>
                    <span className="inv-note">{basisNote(r)}</span>
                  </span>
                  <div className="inv-bars" style={barStyle}>
                    <div className="inv-bar" aria-hidden="true">
                      <span style={{ width: `${(Math.max(0, r.netInvested) / scale) * 100}%`, '--c': 'var(--series-1)' } as CSSVars} />
                    </div>
                    <span className="meter-text">
                      invested <Money value={r.netInvested} />
                    </span>
                    <div className="inv-bar" aria-hidden="true">
                      <span style={{ width: `${(r.value / scale) * 100}%`, '--c': 'var(--series-3)' } as CSSVars} />
                    </div>
                    <span className="meter-text">
                      value <Money value={r.value} />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Widget>
  )
}
