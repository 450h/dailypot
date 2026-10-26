/** Spending rhythm (docs/09 §6.10) and "Where it went" (§6.13): Recharts, duotone, legend + table toggle. */
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateRange, diffDays, formatDate, minDate, weekdayShort, type ISODate } from '@shared/dates'
import { spendingByCategory } from '@shared/engine'
import type { Cycle } from '@shared/schema'
import type { Go } from '../../App'
import { AXIS, GRID, Legend, REF_LINE, SERIES, TableToggle, Tip, compact, tipFor, useChartAnim, type TipProps } from '../../components/Charts'
import { Cols, FoldLine, Money, UserText, Widget, displayAmount } from '../../components/ui'
import { ChartBox } from '../../components/viz'
import { useReady } from '../../state/app'

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }
type TickProps = { x?: number | string; y?: number | string; payload?: { value?: string | number } }

const num = (v: number | string | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0))

/* ------------------------------------------------------------------------------------------------
   Spending rhythm
   ------------------------------------------------------------------------------------------------ */

interface RhythmRow {
  day: number
  date: ISODate
  spent: number
  allowance: number
  future: boolean
  /** Amount over the per-day (0 when under); drives the ▲ label. */
  over: number
  /** Ghost slot for future days (the per-day height), so empty days read as slots. */
  slot: number
}

/** ▲ glyph above over-budget bars (docs/09 §6.10): text, not colour, says "over". */
const overLabel = (p: unknown): React.JSX.Element => {
  const { x, y, width, value } = p as LabelProps
  if (num(value) <= 0) return <g />
  return (
    <text x={num(x) + num(width) / 2} y={num(y) - 4} textAnchor="middle" fontSize={9} fill="var(--series-2)" aria-hidden="true">
      ▲
    </text>
  )
}

export function Rhythm({ cycle }: { cycle: Cycle }): React.JSX.Element {
  const { derived } = useReady()
  const { pot, today, currency } = derived
  const { days } = pot
  const [asTable, setAsTable] = useState(false)
  const anim = useChartAnim(700, 700)
  const rows = useMemo<RhythmRow[]>(() => {
    const byDate = new Map(days.map((d) => [d.date, d]))
    return dateRange(cycle.startDate, cycle.endDate).map((date, i) => {
      const d = byDate.get(date)
      const future = date > today || !d
      const spent = d?.spent ?? 0
      const A = cycle.dailyAllowance
      return { day: i + 1, date, spent, allowance: A, future, over: !future && spent > A ? spent - A : 0, slot: future ? A : 0 }
    })
  }, [days, cycle, today])
  const logged = rows.filter((r) => !r.future)
  const nothingYet = logged.every((r) => r.spent === 0)
  const tip = (p: unknown): React.JSX.Element | null => {
    const q = p as TipProps
    const label = typeof q.label === 'string' ? `${weekdayShort(q.label)} ${formatDate(q.label)}` : q.label
    return <Tip {...q} payload={q.payload?.filter((e) => e.name !== 'slot')} label={label} currency={currency} />
  }
  const interval = rows.length > 24 ? 2 : rows.length > 16 ? 1 : 0

  return (
    <Widget
      span={8}
      index={9}
      title="Spending rhythm"
      subtitle="Daily spending this cycle against your per-day"
      className="rhythm-widget"
      actions={<TableToggle asTable={asTable} onToggle={() => setAsTable(!asTable)} />}
    >
      {asTable ? (
        <div className="table-wrap" style={{ maxHeight: 260, overflow: 'hidden auto' }}>
          <table className="table">
            <Cols cols={[56, 'auto', 'delta', 'num']} />
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Date</th>
                <th scope="col" className="r">Spent</th>
                <th scope="col" className="r">Per-day</th>
              </tr>
            </thead>
            <tbody>
              {logged.map((r) => (
                <tr key={r.date}>
                  <td className="mono">{r.day}</td>
                  <td className="mono">
                    {weekdayShort(r.date)} {formatDate(r.date)}
                  </td>
                  <td className="r">
                    {/* The over-per-day glyph sits in a fixed slot in front of the amount, so the column's right edge stays aligned. */}
                    <span className="over-mark" aria-hidden="true">{r.over > 0 ? '▲' : ''}</span>
                    <Money value={r.spent} className={r.over > 0 ? 'neg' : ''} />
                  </td>
                  <td className="r">
                    <Money value={r.allowance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Legend
            items={[
              { label: 'under per-day', color: SERIES[0] },
              { label: 'over per-day', color: SERIES[1] },
              { label: 'per-day', color: 'var(--ink)', dashed: true }
            ]}
          />
          <ChartBox height={220} delay={700} duration={800}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barCategoryGap={3}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" {...AXIS} interval={interval} tickFormatter={(d: string) => String(diffDays(cycle.startDate, d) + 1)} />
                <YAxis {...AXIS} tickFormatter={compact} width={44} />
                <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
                <ReferenceLine y={cycle.dailyAllowance} {...REF_LINE} label={{ value: 'per-day', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10 }} />
                <Bar dataKey="slot" name="slot" stackId="a" fill="var(--surface-2)" stroke="var(--border)" maxBarSize={22} {...anim} />
                <Bar dataKey="spent" name="Spent" stackId="a" maxBarSize={22} radius={[2, 2, 0, 0]} {...anim}>
                  {rows.map((d) => (
                    <Cell key={d.date} fill={d.future ? 'var(--surface-2)' : d.spent <= d.allowance ? SERIES[0] : SERIES[1]} />
                  ))}
                  <LabelList dataKey="over" content={overLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          {nothingYet ? <p className="faint">Nothing logged yet this cycle — the bars fill as you add daily spending.</p> : null}
        </>
      )}
    </Widget>
  )
}

/* ------------------------------------------------------------------------------------------------
   Where it went
   ------------------------------------------------------------------------------------------------ */

interface CatRow {
  key: string
  name: string
  color: string
  daily: number
  nonDaily: number
  total: number
}

const Y_WIDTH = 128

export function WhereItWent({ cycle, go }: { cycle: Cycle; go: Go }): React.JSX.Element {
  const { state, derived } = useReady()
  const { today, currency, categories } = derived
  const [asTable, setAsTable] = useState(false)
  const anim = useChartAnim(900, 700)
  const rows = useMemo<CatRow[]>(() => {
    const totals = spendingByCategory(state, cycle.startDate, minDate(cycle.endDate, today))
    const top = totals.slice(0, 6).map((t) => {
      const c = categories.get(t.categoryId)
      return { key: t.categoryId, name: c?.name ?? 'Other', color: c?.color ?? 'var(--ink-3)', daily: t.daily, nonDaily: t.nonDaily, total: t.total }
    })
    const rest = totals.slice(6)
    if (rest.length > 0) {
      top.push({
        key: 'other',
        name: 'Other',
        color: 'var(--ink-3)',
        daily: rest.reduce((s, t) => s + t.daily, 0),
        nonDaily: rest.reduce((s, t) => s + t.nonDaily, 0),
        total: rest.reduce((s, t) => s + t.total, 0)
      })
    }
    return top
  }, [state, cycle, today, categories])
  const tip = tipFor(currency)

  /** Category tick: the category's colour as a ring-bound dot (docs/09 §4.15) + the name in text tokens. */
  const catTick = (p: unknown): React.JSX.Element => {
    const { x, y, payload } = p as TickProps
    const name = String(payload?.value ?? '')
    const row = rows.find((r) => r.name === name)
    const shown = name.length > 16 ? `${name.slice(0, 15)}…` : name
    return (
      <g transform={`translate(${num(x)},${num(y)})`}>
        <circle cx={-(Y_WIDTH - 14)} cy={0} r={5} fill={row?.color ?? 'var(--ink-3)'} stroke="var(--ink)" strokeWidth={1} />
        <text x={-(Y_WIDTH - 26)} y={0} dy={4} fontSize={11} fill="var(--text-2)" textAnchor="start" style={{ fontFamily: 'var(--font-text)' }}>
          {shown}
        </text>
      </g>
    )
  }
  const totalLabel = (p: unknown): React.JSX.Element => {
    const { x, y, width, height, value } = p as LabelProps
    return (
      <text className="dash-label" x={num(x) + num(width) + 6} y={num(y) + num(height) / 2} dy={4} fontSize={12} fill="var(--text)" style={{ fontFamily: 'var(--mono)' }}>
        {displayAmount(num(value))}
      </text>
    )
  }
  const actions: ReactNode = (
    <>
      <button type="button" className="btn sm ghost" onClick={() => go('reports')}>
        Reports →
      </button>
      {rows.length > 0 ? <TableToggle asTable={asTable} onToggle={() => setAsTable(!asTable)} /> : null}
    </>
  )

  return (
    <Widget span={6} spanCompact={12} index={12} title="Where it went" subtitle="Spending by category this cycle" className="where-widget" actions={actions}>
      {rows.length === 0 ? (
        <p className="muted">Nothing spent this cycle yet.</p>
      ) : asTable ? (
        <div className="table-wrap" style={{ maxHeight: 260, overflow: 'hidden auto' }}>
          <table className="table">
            {/* Folding ledger (docs/09 §4.12): at span 6 the daily / non-daily split folds under the category, the total stays. */}
            <Cols cols={['auto', ['num', 2], ['num', 2], 'num']} />
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="r" data-fold="2">
                  Daily
                </th>
                <th scope="col" className="r" data-fold="2">
                  Non-daily
                </th>
                <th scope="col" className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                      <UserText>{r.name}</UserText>
                    </span>
                    <FoldLine level={2}>
                      daily <Money value={r.daily} /> · non-daily <Money value={r.nonDaily} />
                    </FoldLine>
                  </td>
                  <td className="r" data-fold="2">
                    <Money value={r.daily} />
                  </td>
                  <td className="r" data-fold="2">
                    <Money value={r.nonDaily} />
                  </td>
                  <td className="r">
                    <Money value={r.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Legend
            items={[
              { label: 'daily', color: SERIES[0] },
              { label: 'non-daily', color: SERIES[1] }
            ]}
          />
          <ChartBox height={Math.max(160, 36 * rows.length + 24)} delay={900} duration={700}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" {...AXIS} tickFormatter={compact} />
                <YAxis type="category" dataKey="name" {...AXIS} width={Y_WIDTH} interval={0} tick={catTick} />
                <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="daily" name="Daily" stackId="a" fill={SERIES[0]} maxBarSize={18} {...anim} />
                <Bar dataKey="nonDaily" name="Non-daily" stackId="a" fill={SERIES[1]} stroke="var(--surface)" strokeWidth={2} maxBarSize={18} {...anim}>
                  <LabelList dataKey="total" content={totalLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </>
      )}
    </Widget>
  )
}
