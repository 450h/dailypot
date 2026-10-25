/** Masthead (docs/09 §6.1): the live main balance, its ledger and 30-day sparkline. Net worth (§6.2) beside it. */
import { Fragment, useMemo } from 'react'
import { formatDate } from '@shared/dates'
import { balanceSeries } from '@shared/engine'
import { Count, Money, Widget, type CSSVars } from '../../components/ui'
import { Spark, StackedBar, type BarSegment } from '../../components/viz'
import { useReady } from '../../state/app'

const LEDGER_T0 = 450

export function Masthead({ onAnchor }: { onAnchor: () => void }): React.JSX.Element {
  const { state, derived } = useReady()
  const { balance, currency, today } = derived
  const series = useMemo(() => balanceSeries(state, today, 30).map((p) => ({ date: p.date, value: p.balance })), [state, today])
  const anchor = state.settings.balanceAnchor
  const f = balance.flows
  const since = balance.since ?? today
  const eyebrow = balance.anchored ? (balance.balance < 0 ? 'Main balance (overdrawn)' : 'Main balance') : `Change since ${formatDate(since)}`
  const lines: Array<{ label: string; value: number }> = [
    { label: 'Income', value: f.income },
    { label: 'Spending', value: -(f.daily + f.nonDaily) },
    { label: 'Bills', value: -f.bills },
    { label: 'Saved', value: -f.goals },
    { label: 'Invested', value: -f.investments }
  ]
  const row = (j: number): CSSVars => ({ '--t0': `${LEDGER_T0}ms`, '--j': j })

  return (
    <Widget span={8} index={0} variant="masthead" className="masthead-widget">
      <div className="masthead-head">
        <span className="row" style={{ gap: 10 }}>
          <span className="stat-label">{eyebrow}</span>
          {!balance.anchored ? (
            <button type="button" className="btn sm ghost" onClick={onAnchor}>
              Set your balance
            </button>
          ) : null}
        </span>
        <span className="row faint" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <span className="live-dot" aria-hidden="true" />
          as of today, recalculated from your history
        </span>
      </div>
      <div className="masthead-grid">
        <div className="hero">
          <Count value={balance.balance} currency={currency} hero id="hero-balance" delay={150} />
          {series.length > 0 ? (
            <Spark data={series} height={56} begin={300} duration={900} currency={currency} name="Balance" />
          ) : (
            <div className="spark-empty faint">No balance history yet</div>
          )}
        </div>
        <div className="ledger" role="group" aria-label="How the balance was built">
          {anchor ? (
            <>
              <span className="row-anim" style={row(0)}>
                Anchor {formatDate(anchor.date)}
              </span>
              <span className="row-anim" style={row(0)}>
                <Money value={anchor.amount} />
              </span>
            </>
          ) : (
            <>
              <span className="row-anim" style={row(0)}>
                From {formatDate(since)}
              </span>
              <span className="row-anim" style={row(0)}>
                <Money value={0} />
              </span>
            </>
          )}
          {lines.map((l, j) => (
            <Fragment key={l.label}>
              <span className="row-anim" style={row(j + 1)}>
                {l.label}
              </span>
              <span className="row-anim" style={row(j + 1)}>
                <Money value={l.value} signed />
              </span>
            </Fragment>
          ))}
          <button type="button" className="btn sm ghost ledger-foot" onClick={onAnchor}>
            {balance.anchored ? 'Adjust anchor' : 'Set anchor'}
          </button>
        </div>
      </div>
    </Widget>
  )
}

export function NetWorthWidget({ onAnchor }: { onAnchor: () => void }): React.JSX.Element {
  const { derived } = useReady()
  const { netWorth: nw, balance, currency, today } = derived
  const since = balance.since ?? today
  const segments: BarSegment[] = [
    { key: 'cash', label: 'Cash', value: nw.cash, color: 'var(--series-1)', hatched: nw.cash < 0 },
    { key: 'savings', label: 'Savings', value: nw.savings, color: 'var(--series-3)' },
    { key: 'inv', label: 'Investments', value: nw.investments, color: 'var(--series-5)' }
  ]
  const rows: Array<{ key: string; name: string; sub: string; value: number; color: string }> = [
    { key: 'cash', name: 'Cash', sub: nw.anchored ? 'main balance' : `change since ${formatDate(since)}`, value: nw.cash, color: 'var(--series-1)' },
    { key: 'savings', name: 'Savings', sub: 'active goals', value: nw.savings, color: 'var(--series-3)' },
    { key: 'inv', name: 'Investments', sub: 'portfolio value', value: nw.investments, color: 'var(--series-5)' }
  ]
  return (
    <Widget span={4} index={1} title="Net worth" className="nw-widget">
      <Count value={nw.total} currency={currency} hero="secondary" id="net-worth" delay={150} />
      <StackedBar segments={segments} height={10} delay={400} stagger={80} label="Net worth composition" />
      <div className="nw-legend">
        {rows.map((r, j) => {
          const style: CSSVars = { '--t0': `${LEDGER_T0}ms`, '--j': j }
          return (
            <Fragment key={r.key}>
              <span className="swatch row-anim" style={{ ...style, background: r.color }} aria-hidden="true" />
              <span className="row-anim" style={style}>
                {r.name} <span className="faint">{r.sub}</span>
              </span>
              <span className="row-anim" style={style}>
                <Money value={r.value} />
              </span>
            </Fragment>
          )
        })}
      </div>
      <p className="faint">cash = main balance; goals and holdings count as money that left it</p>
      {!nw.anchored ? (
        <button type="button" className="btn sm ghost dash-link" onClick={onAnchor}>
          Set your balance to make this a true net worth
        </button>
      ) : null}
    </Widget>
  )
}
