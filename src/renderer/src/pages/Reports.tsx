/** F8 — Reports: cycle summary + charts (dataviz rules: one axis, thin marks, tooltip, table view). */
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate } from '@shared/dates'
import { cycleSummary, holdingFigures, spendingByCategory, type CycleSummary } from '@shared/engine'
import { formatAmount } from '@shared/money'
import { AXIS, ChartCard, GRID, Legend, SERIES, Tip, compact, type TipEntry } from '../components/Charts'
import { Field, Money } from '../components/ui'
import { useReady } from '../state/app'

type TipProps = { active?: boolean; payload?: readonly TipEntry[]; label?: string | number }

export function Reports(): React.JSX.Element {
  const { state, derived } = useReady()
  const { cycles, pot, today, currency: c } = derived
  const started = cycles.filter((x) => x.startDate <= today)
  const [cycleId, setCycleId] = useState(derived.current?.id ?? started.at(-1)?.id ?? '')
  const idx = started.findIndex((x) => x.id === cycleId)
  const cycle = started[idx]
  const prev = idx > 0 ? started[idx - 1] : undefined
  const tip = (p: unknown): React.JSX.Element | null => <Tip {...(p as TipProps)} currency={c} />

  const summary = cycle ? cycleSummary(state, pot, cycle, today) : null
  const prevSummary = prev ? cycleSummary(state, pot, prev, today) : null

  const byCat = cycle
    ? spendingByCategory(state, cycle.startDate, cycle.endDate).map((r) => ({ name: derived.categories.get(r.categoryId)?.name ?? 'Unknown', value: r.total, daily: r.daily, nonDaily: r.nonDaily }))
    : []

  const daily = cycle ? pot.days.filter((d) => d.cycleId === cycle.id).map((d) => ({ label: formatDate(d.date), value: d.spent, allowance: d.allowance })) : []

  const potLine = pot.days.slice(-120).map((d) => ({ label: formatDate(d.date), value: d.balanceAfter }))

  const lastSix = started.slice(-6).map((x) => cycleSummary(state, pot, x, today))
  const cycleBars = lastSix.map((s) => ({
    label: formatDate(s.cycle.startDate),
    'Daily spend': s.dailySpend,
    'Pot at end': s.closingPot ?? s.currentPot ?? 0,
    'Bills from main': s.billsFromMain
  }))

  const holdings = state.holdings.filter((h) => !h.archived).map((h) => holdingFigures(state, h))
  const portfolio = holdings.map((h) => ({ label: h.holding.name, 'Net invested': h.netInvested, 'Current value': h.value }))

  if (!cycle || !summary) {
    return (
      <div className="page">
        <h1>Reports</h1>
        <p className="muted">Reports appear once your first cycle has started.</p>
      </div>
    )
  }

  const compare = (cur: number, before: number | undefined, lowerIsBetter = false): React.JSX.Element | null => {
    if (before === undefined || before === cur) return null
    const diff = cur - before
    const good = lowerIsBetter ? diff < 0 : diff > 0
    return (
      <span className={`faint ${good ? 'pos' : 'neg'}`}>
        {diff > 0 ? '▲' : '▼'} {formatAmount(Math.abs(diff))}
      </span>
    )
  }

  const rows: Array<[string, number | null, keyof CycleSummary | null, boolean]> = [
    ['Opening pot', summary.openingPot, 'openingPot', false],
    [summary.closingPot !== null ? 'Closing pot' : 'Pot now', summary.closingPot ?? summary.currentPot, null, false],
    ['Cycle budget (per-day × days)', summary.totalAllowance, 'totalAllowance', false],
    ['Daily spending', summary.dailySpend, 'dailySpend', true],
    ['Non-daily spending', summary.nonDailySpend, 'nonDailySpend', true],
    ['Income', summary.income, 'income', false],
    ['Bills paid', summary.billsPaid, 'billsPaid', true],
    ['  … from the pot', summary.billsFromPot, 'billsFromPot', false],
    ['  … from main balance', summary.billsFromMain, 'billsFromMain', true],
    ['Saved to goals', summary.goalNet, 'goalNet', false],
    ['Invested (net)', summary.investmentNet, 'investmentNet', false],
    ['Cash flow (income − all outflows)', summary.cashFlow, 'cashFlow', false]
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reports</h1>
        <Field label="Cycle">
          <select className="input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {[...started].reverse().map((x) => (
              <option key={x.id} value={x.id}>
                {formatDate(x.startDate, true)} – {formatDate(x.endDate, true)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Cycle summary</h2>
          <p className="faint">
            {formatDate(cycle.startDate, true)} – {formatDate(cycle.endDate, true)}
            {prevSummary ? ' · arrows compare with the previous cycle' : ''}
          </p>
          <table className="table">
            <tbody>
              {rows.map(([label, value, key, lowerBetter]) => (
                <tr key={label}>
                  <td className={label.startsWith('  ') ? 'faint' : ''}>{label.trim()}</td>
                  <td className="r">
                    {value === null ? '—' : <Money value={value} />} {key && prevSummary ? compare(value ?? 0, prevSummary[key] as number | undefined, lowerBetter) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.shortfallCount > 0 ? <p className="faint warn-text">{summary.shortfallCount} bill payment(s) needed money from your main balance.</p> : null}
        </div>

        <ChartCard
          title="Spending by category"
          subtitle={`Daily + non-daily, ${c}`}
          empty={byCat.length === 0 ? 'No spending in this cycle yet.' : null}
          table={{ columns: ['Category', 'Daily', 'Non-daily', 'Total'], rows: byCat.map((r) => [r.name, formatAmount(r.daily), formatAmount(r.nonDaily), formatAmount(r.value)]) }}
        >
          <ResponsiveContainer>
            <BarChart data={byCat} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={4}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} tickFormatter={compact} />
              <YAxis type="category" dataKey="name" {...AXIS} width={120} />
              <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar isAnimationActive={false} dataKey="value" name="Spent" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Daily spending vs per-day"
        subtitle="Bars under the dashed line fed the pot; bars over it drew from it"
        legend={<Legend items={[{ label: 'Daily spending', color: SERIES[0] }, { label: 'Per-day', color: 'var(--text-3)', dashed: true }]} />}
        table={{ columns: ['Day', 'Spent', 'Per-day'], rows: daily.map((d) => [d.label, formatAmount(d.value), formatAmount(d.allowance)]) }}
      >
        <ResponsiveContainer>
          <BarChart data={daily} margin={{ right: 16 }} barCategoryGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...AXIS} tickFormatter={compact} width={48} />
            <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
            <ReferenceLine y={cycle.dailyAllowance} stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth={2} ifOverflow="extendDomain" />
            <Bar isAnimationActive={false} dataKey="value" name="Spent" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Pot balance over time"
        subtitle="Last 120 days · end-of-day balance"
        table={{ columns: ['Day', 'Pot'], rows: potLine.map((d) => [d.label, formatAmount(d.value)]) }}
      >
        <ResponsiveContainer>
          <LineChart data={potLine} margin={{ right: 16 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={32} />
            <YAxis {...AXIS} tickFormatter={compact} width={48} />
            <Tooltip content={tip} cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }} />
            <ReferenceLine y={0} stroke="var(--text-3)" strokeWidth={1} />
            <Line isAnimationActive={false} type="linear" dataKey="value" name="Pot" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Cycle over cycle"
        subtitle={`Last ${lastSix.length} cycles, ${c}`}
        legend={<Legend items={[{ label: 'Daily spend', color: SERIES[0] }, { label: 'Pot at end', color: SERIES[1] }, { label: 'Bills from main', color: SERIES[2] }]} />}
        table={{
          columns: ['Cycle start', 'Daily spend', 'Pot at end', 'Bills from main'],
          rows: cycleBars.map((r) => [r.label, formatAmount(r['Daily spend']), formatAmount(r['Pot at end']), formatAmount(r['Bills from main'])])
        }}
      >
        <ResponsiveContainer>
          <BarChart data={cycleBars} margin={{ right: 16 }} barGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={compact} width={48} />
            <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
            <ReferenceLine y={0} stroke="var(--text-3)" />
            <Bar isAnimationActive={false} dataKey="Daily spend" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar isAnimationActive={false} dataKey="Pot at end" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar isAnimationActive={false} dataKey="Bills from main" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Portfolio"
        subtitle="Net invested vs current value per holding"
        empty={portfolio.length === 0 ? 'No holdings yet — add them under Investments.' : null}
        legend={<Legend items={[{ label: 'Net invested', color: SERIES[0] }, { label: 'Current value', color: SERIES[1] }]} />}
        table={{ columns: ['Holding', 'Net invested', 'Current value'], rows: portfolio.map((r) => [r.label, formatAmount(r['Net invested']), formatAmount(r['Current value'])]) }}
      >
        <ResponsiveContainer>
          <BarChart data={portfolio} margin={{ right: 16 }} barGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={compact} width={48} />
            <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar isAnimationActive={false} dataKey="Net invested" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar isAnimationActive={false} dataKey="Current value" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
