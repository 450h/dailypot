/** Today ring (docs/09 §6.4), the pot and its trend (§6.5) and the cycle flow (§6.6). */
import { Fragment, useMemo, useState, type RefObject } from 'react'
import { formatDate, type ISODate } from '@shared/dates'
import { cycleSummary, earmarks, openInstances, safeToSpend, type PotResult } from '@shared/engine'
import { formatAmount, formatMoney } from '@shared/money'
import type { Cycle } from '@shared/schema'
import type { Go } from '../../App'
import { TableToggle } from '../../components/Charts'
import { Chip, Cols, Count, FoldLine, MINUS, Money, Widget, displayAmount } from '../../components/ui'
import { Ring, Spark, StackedBar, type BarSegment } from '../../components/viz'
import { useReady } from '../../state/app'
import { startAt } from './shared'

/* ------------------------------------------------------------------------------------------------
   Today ring
   ------------------------------------------------------------------------------------------------ */

export function TodayRing({ cycle }: { cycle: Cycle }): React.JSX.Element {
  const { derived } = useReady()
  const { pot, today, currency } = derived
  const spent = pot.days.find((d) => d.date === today)?.spent ?? 0
  const A = cycle.dailyAllowance
  const guide = safeToSpend(pot, cycle, today) // O(open instances); the React Compiler lint rejects a manual useMemo here
  const left = A - spent
  const value = A > 0 ? spent / A : 0
  const over = A > 0 && spent > A ? (spent - A) / A : 0
  const marker = A > 0 && guide.safeDaily < A ? Math.max(0, guide.safeDaily) / A : null
  const short = Math.max(guide.unavoidableShortfall, guide.fromMainNow)

  return (
    <Widget span={4} spanCompact={6} index={3} className="today-ring">
      <div className="ring-wrap">
        <Ring value={value} over={over} marker={marker} label={`Spent ${formatAmount(spent)} of ${formatAmount(A)} today`} size={168} stroke={10} delay={220} duration={800}>
          <span className="stat-label">Left to spend today</span>
          <span className={`stat-value ${left < 0 ? 'neg' : ''}`}>
            <Count value={left} currency={currency} id="left-today" delay={220} />
          </span>
        </Ring>
        <span className="stat-sub">
          Spent <Money value={spent} /> of <Money value={A} /> per-day
        </span>
      </div>

      <div className="safe-block">
        <span className="eyebrow">Safe to spend per day</span>
        {guide.allFunded ? (
          <>
            <span className="safe-value pos">
              <Money value={A} currency={currency} />
            </span>
            <span className="stat-sub">All bills this cycle are funded — your full per-day is safe.</span>
          </>
        ) : guide.safeDaily >= 0 ? (
          <>
            <span className="safe-value">
              <Money value={guide.safeDaily} currency={currency} />
            </span>
            <span className="stat-sub">
              Spend at most this per day (today: <Money value={Math.max(0, guide.safeDaily - spent)} /> left) so the pot covers your upcoming bills.
            </span>
          </>
        ) : (
          <>
            <span className="safe-value neg">
              <Money value={0} currency={currency} />
            </span>
            <span className="stat-sub warn-text">
              The pot can’t cover upcoming bills even if you spend nothing — about {formatMoney(guide.unavoidableShortfall, currency)} will come from your main balance.
            </span>
          </>
        )}
        {guide.fromMainNow > 0 ? <span className="stat-sub warn-text">About {formatMoney(guide.fromMainNow, currency)} of today’s/overdue bills will come from your main balance.</span> : null}
        <span>
          {guide.allFunded ? (
            <Chip tone="ok" pop delay={1000}>
              All bills funded
            </Chip>
          ) : short > 0 ? (
            <Chip tone="warn" glyph="!" pop delay={1000}>
              Short by {displayAmount(short)}
            </Chip>
          ) : (
            <Chip tone="warn" glyph="●" pop delay={1000}>
              Safe {displayAmount(guide.safeDaily)} a day
            </Chip>
          )}
        </span>
      </div>
    </Widget>
  )
}

/* ------------------------------------------------------------------------------------------------
   Pot and its trend
   ------------------------------------------------------------------------------------------------ */

/** The first open bill the pot's earmarks don't fully cover (docs/05 §5 "funded"), with the cumulative amount up to it. */
function nextUnfunded(pot: PotResult, cycle: Cycle): { name: string; dueDate: ISODate; cumulative: number } | null {
  const funded = earmarks(pot, cycle)
  let running = 0
  for (const inst of openInstances(pot, cycle)) {
    running += inst.plannedAmount
    if ((funded.get(inst.key) ?? 0) < inst.plannedAmount) return { name: inst.name, dueDate: inst.dueDate, cumulative: running }
  }
  return null
}

export function PotWidget({ cycle, figureRef, go }: { cycle: Cycle; figureRef: RefObject<HTMLSpanElement | null>; go: Go }): React.JSX.Element {
  const { derived } = useReady()
  const { pot, currency } = derived
  const [asTable, setAsTable] = useState(false)
  const t0 = startAt(4)
  const opening = pot.cycleOpening.get(cycle.id) ?? 0
  const diff = pot.balance - opening
  const last30 = useMemo(() => pot.days.slice(-30), [pot])
  const series = useMemo(() => last30.map((d) => ({ date: d.date, value: d.balanceAfter })), [last30])
  const threshold = useMemo(() => nextUnfunded(pot, cycle), [pot, cycle])
  const openCount = openInstances(pot, cycle).length

  return (
    <Widget span={4} spanCompact={6} index={4} className="pot-widget">
      <div className="card-title">
        <span className="stat-label">Side pot</span>
        <TableToggle asTable={asTable} onToggle={() => setAsTable(!asTable)} />
      </div>
      <span ref={figureRef} className={`stat-value ${pot.balance < 0 ? 'neg' : ''}`}>
        <Count value={pot.balance} currency={currency} id="pot" delay={t0} />
      </span>
      <span className="stat-sub">
        {pot.balance < 0 ? 'Pot deficit · ' : ''}Pot after today <Money value={pot.projected} /> · opened this cycle at <Money value={opening} />
      </span>
      <span>
        {diff === 0 ? (
          <Chip tone="neutral" glyph="—" pop delay={1000}>
            unchanged since opening
          </Chip>
        ) : (
          <Chip tone={diff > 0 ? 'ok' : 'danger'} glyph={diff > 0 ? '▲' : '▼'} pop delay={1000}>
            {diff > 0 ? '+' : MINUS}
            {displayAmount(Math.abs(diff))} vs opening
          </Chip>
        )}
      </span>
      {asTable ? (
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table className="table">
            {/* Folding ledger (docs/09 §4.12): at span 4 the delta folds under the date, the pot stays. */}
            <Cols cols={['auto', ['delta', 2], 'num']} />
            <thead>
              <tr>
                <th>Date</th>
                <th className="r" data-fold="2">
                  Delta
                </th>
                <th className="r">Pot after</th>
              </tr>
            </thead>
            <tbody>
              {[...last30].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="mono">
                    {formatDate(d.date)}
                    {d.closed ? '' : ' · projected'}
                    <FoldLine level={2}>
                      delta <Money value={d.delta} signed />
                    </FoldLine>
                  </td>
                  <td className="r" data-fold="2">
                    <Money value={d.delta} signed />
                  </td>
                  <td className="r">
                    <Money value={d.balanceAfter} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Spark
          data={series}
          height={72}
          begin={t0}
          duration={900}
          currency={currency}
          name="Pot"
          references={threshold ? [{ y: threshold.cumulative, label: `${threshold.name} · ${formatDate(threshold.dueDate)}` }] : []}
        />
      )}
      <p className="faint pot-threshold">
        {threshold ? (
          <>
            <Money value={threshold.cumulative - pot.balance} /> more to cover <span dir="auto">{threshold.name}</span>
          </>
        ) : openCount > 0 ? (
          'Covers every bill this cycle'
        ) : (
          'No bills left to cover this cycle'
        )}
      </p>
      <button type="button" className="btn sm ghost dash-link" onClick={() => go('pot')}>
        How the pot was built →
      </button>
    </Widget>
  )
}

/* ------------------------------------------------------------------------------------------------
   Cycle flow
   ------------------------------------------------------------------------------------------------ */

export function CycleFlow({ cycle }: { cycle: Cycle }): React.JSX.Element {
  const { state, derived } = useReady()
  const { pot, today } = derived
  const s = useMemo(() => cycleSummary(state, pot, cycle, today), [state, pot, cycle, today])
  // Cash that came back this cycle (a goal withdrawal, a holding sale): the engine nets it into goalNet / investmentNet,
  // so cashFlow can exceed income. The bar can only show it as more "Left"; the legend and the sentence say where it came from.
  const returned = Math.max(0, -s.goalNet) + Math.max(0, -s.investmentNet)
  const sources = s.income + returned
  const kept = Math.max(0, s.cashFlow)
  // `bar` is the clamped width; `shown` is the engine's signed figure, which is what the legend prints.
  const rows = [
    { key: 'daily', label: 'Daily', color: 'var(--ink)', bar: s.dailySpend, shown: s.dailySpend },
    { key: 'nonDaily', label: 'Non-daily', color: 'var(--ink-2)', bar: s.nonDailySpend, shown: s.nonDailySpend },
    { key: 'bills', label: 'Bills', color: 'var(--ink-3)', bar: s.billsPaid, shown: s.billsPaid },
    { key: 'invested', label: 'Invested', color: 'var(--series-5)', bar: Math.max(0, s.investmentNet), shown: s.investmentNet },
    { key: 'saved', label: 'Saved', color: 'var(--series-3)', bar: Math.max(0, s.goalNet), shown: s.goalNet },
    { key: 'left', label: 'Left', color: 'var(--series-1)', bar: kept, shown: s.cashFlow }
  ]
  const segments: BarSegment[] = rows.map(({ key, label, color, bar }) => ({ key, label, value: bar, color }))
  return (
    <Widget span={4} spanCompact={12} index={5} title="Cycle flow" subtitle="Where this cycle’s income went" className="flow-widget">
      {s.income === 0 ? (
        <p className="muted">No income logged this cycle yet. Add your salary with the Income kind in the quick add below.</p>
      ) : (
        <>
          <StackedBar segments={segments} height={12} labels delay={500} stagger={60} label="This cycle’s income split" />
          <div className="flow-legend">
            <span aria-hidden="true" />
            <span>Income</span>
            <Money value={s.income} />
            {returned > 0 ? (
              <>
                <span aria-hidden="true" />
                <span>
                  Returned <span className="faint">from goals / holdings</span>
                </span>
                <Money value={returned} />
              </>
            ) : null}
            {rows.map((r) => (
              <Fragment key={r.key}>
                <span className="swatch" style={{ background: r.color }} aria-hidden="true" />
                <span>{r.label}</span>
                <Money value={r.shown} />
              </Fragment>
            ))}
          </div>
          <p className={`flow-sentence ${s.cashFlow < 0 ? 'neg' : ''}`}>
            {s.cashFlow > 0 ? (
              <>
                You kept <Money value={s.cashFlow} /> of <Money value={sources} /> this cycle
                {returned > 0 ? (
                  <>
                    {' '}
                    (incl. <Money value={returned} /> returned from goals or holdings)
                  </>
                ) : null}
              </>
            ) : s.cashFlow === 0 ? (
              'You spent exactly what you earned this cycle'
            ) : (
              <>
                You spent <Money value={-s.cashFlow} /> more than you earned this cycle
              </>
            )}
          </p>
        </>
      )}
    </Widget>
  )
}
