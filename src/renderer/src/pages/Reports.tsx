/**
 * F8 — Reports (docs/09 §8 "Reports", §7.4): a KPI row that counts up, the cycle summary with ▲/▼ deltas and
 * indented sub-rows, and duotone charts behind a curtain that animate once per mount (a cycle change re-renders
 * without replaying). Every figure comes from @shared/engine; this file only arranges and formats them.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type LabelProps } from 'recharts'
import { formatDate } from '@shared/dates'
import { balanceSeries, cycleLength, cycleSummary, holdingFigures, spendingByCategory, type CycleSummary } from '@shared/engine'
import { formatAmount } from '@shared/money'
import { BalanceDialog } from '../components/BalanceDialog'
import { AXIS, ChartCard, GRID, Legend, REF_LINE, SERIES, Tip, ZERO_LINE, compact, tipFor, useChartAnim, type ChartAnim, type TipEntry, type TipProps } from '../components/Charts'
import { Cols, Count, Delta, Empty, Field, Money, PageHead, UserText, type CSSVars } from '../components/ui'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReady } from '../state/app'
import '../styles/pages/reports.css'

/** Recharts hands the data row to tooltip entries as `payload`. */
type RowTipEntry = TipEntry & { payload?: { value: number; projected?: boolean } }

const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0]

/** Summary row: an engine figure, the previous cycle's figure (undefined = not comparable) and how to judge the change. */
interface SummaryRow {
  label: string
  value: number | null
  prev: number | null | undefined
  lowerIsBetter?: boolean
  sub?: boolean
}

/** ▲ above an over-budget bar (docs/09 §9.2): the dashed per-day line and the table are the other two signals. */
function OverLabel(props: LabelProps): React.JSX.Element | null {
  if (!props.value) return null
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2
  const y = Number(props.y ?? 0) - 3
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={8} fill="var(--series-2)" aria-hidden="true">
      ▲
    </text>
  )
}

function Kpi({ label, value, currency, delay, id, signed, sub }: { label: string; value: number; currency: string; delay: number; id: string; signed?: boolean; sub?: ReactNode }): React.JSX.Element {
  return (
    <div className="tile">
      <span className="eyebrow">{label}</span>
      <span className="stat-value">
        <Count value={value} currency={currency} signed={signed} id={id} delay={delay} />
      </span>
      <span className="kpi-sub">{sub ?? 'this cycle'}</span>
    </div>
  )
}

export function Reports(): React.JSX.Element {
  const { state, derived } = useReady()
  const { cycles, pot, today, currency: c, current, balance, categories } = derived
  const reduced = usePrefersReducedMotion()
  // Charts animate once per page mount; the cycle picker turns it off so a reading page never replays.
  const [animate, setAnimate] = useState(!reduced)
  const [anchorOpen, setAnchorOpen] = useState(false)

  const started = useMemo(() => cycles.filter((x) => x.startDate <= today), [cycles, today])
  const [cycleId, setCycleId] = useState(current?.id ?? started.at(-1)?.id ?? '')
  const idx = started.findIndex((x) => x.id === cycleId)
  const cycle = started[idx]
  const prev = idx > 0 ? started[idx - 1] : undefined

  const animCat = useChartAnim(400, 700)
  const animDaily = useChartAnim(480, 700)
  const animPot = useChartAnim(560, 900)
  const animBalance = useChartAnim(640, 900)
  const animCycles = useChartAnim(720, 700)
  const animPortfolio = useChartAnim(800, 700)
  const sync = (a: ChartAnim): ChartAnim => ({ ...a, isAnimationActive: animate && a.isAnimationActive })

  const summary = useMemo(() => (cycle ? cycleSummary(state, pot, cycle, today) : null), [state, pot, cycle, today])
  const prevSummary = useMemo(() => (prev ? cycleSummary(state, pot, prev, today) : null), [state, pot, prev, today])

  const byCat = useMemo(
    () =>
      cycle
        ? spendingByCategory(state, cycle.startDate, cycle.endDate).map((r) => ({
            name: categories.get(r.categoryId)?.name ?? 'Unknown',
            value: r.total,
            daily: r.daily,
            nonDaily: r.nonDaily
          }))
        : [],
    [state, cycle, categories]
  )

  const daily = useMemo(
    () => (cycle ? pot.days.filter((d) => d.cycleId === cycle.id).map((d) => ({ label: formatDate(d.date), value: d.spent, allowance: d.allowance, over: d.spent > d.allowance ? 1 : 0 })) : []),
    [pot, cycle]
  )

  // Today's point is the projected pot (balance + today's open delta), as on Pot history; it is marked as such.
  const potLine = useMemo(
    () => pot.days.slice(-120).map((d) => ({ label: formatDate(d.date), value: d.balanceAfter, pos: Math.max(0, d.balanceAfter), neg: Math.min(0, d.balanceAfter), projected: !d.closed })),
    [pot]
  )

  // balanceSeries may be [] even when anchored (clock rolled back); the card shows its empty text then.
  const balanceLine = useMemo(() => balanceSeries(state, today, 120).map((p) => ({ label: formatDate(p.date), value: p.balance, pos: Math.max(0, p.balance), neg: Math.min(0, p.balance) })), [state, today])

  const lastSix = useMemo(() => started.slice(-6).map((x) => cycleSummary(state, pot, x, today)), [started, state, pot, today])
  // Memoised: a new data array makes Recharts replay the bar animation on every unrelated re-render.
  const cycleBars = useMemo(
    () =>
      lastSix.map((s) => ({
        label: formatDate(s.cycle.startDate),
        'Daily spend': s.dailySpend,
        'Pot at end': s.closingPot ?? s.currentPot ?? 0,
        'Bills from main': s.billsFromMain
      })),
    [lastSix]
  )

  const holdings = useMemo(() => state.holdings.filter((h) => !h.archived).map((h) => holdingFigures(state, h, today)), [state, today])
  const portfolio = useMemo(() => holdings.map((h) => ({ label: h.holding.name, 'Net invested': h.netInvested, 'Current value': h.value })), [holdings])

  const tip = tipFor(c)
  /** One entry per hover for the split pos/neg areas: the row's signed value, swatch by sign; `projectedName` for a projected row. */
  const tipSplit =
    (name: string, projectedName?: string) =>
    (p: unknown): React.JSX.Element | null => {
      const q = p as TipProps & { payload?: readonly RowTipEntry[] }
      const row = q.payload?.[0]?.payload
      return <Tip active={q.active} label={q.label} currency={c} payload={row ? [{ name: row.projected && projectedName ? projectedName : name, value: row.value, color: row.value < 0 ? SERIES[1] : SERIES[0] }] : []} />
    }

  if (!cycle || !summary) {
    return (
      <div className="page reports">
        <PageHead dateline="No cycle has started yet" title="Reports" />
        <div className="rule" />
        <Empty title="Reports appear once your first cycle has started">
          <p className="muted">Come back on your first tracked day: the summary, the spending charts and the pot line fill in from there.</p>
        </Empty>
      </div>
    )
  }

  const rows: SummaryRow[] = [
    { label: 'Opening pot', value: summary.openingPot, prev: prevSummary?.openingPot },
    { label: summary.closingPot !== null ? 'Closing pot' : 'Pot now', value: summary.closingPot ?? summary.currentPot, prev: undefined },
    { label: 'Cycle budget (per-day × days)', value: summary.totalAllowance, prev: prevSummary?.totalAllowance },
    { label: 'Daily spending', value: summary.dailySpend, prev: prevSummary?.dailySpend, lowerIsBetter: true },
    { label: 'Non-daily spending', value: summary.nonDailySpend, prev: prevSummary?.nonDailySpend, lowerIsBetter: true },
    { label: 'Income', value: summary.income, prev: prevSummary?.income },
    { label: 'Bills paid', value: summary.billsPaid, prev: prevSummary?.billsPaid, lowerIsBetter: true },
    { label: 'from the pot', value: summary.billsFromPot, prev: prevSummary?.billsFromPot, sub: true },
    { label: 'from main balance', value: summary.billsFromMain, prev: prevSummary?.billsFromMain, lowerIsBetter: true, sub: true },
    { label: 'Saved to goals', value: summary.goalNet, prev: prevSummary?.goalNet },
    { label: 'Invested (net)', value: summary.investmentNet, prev: prevSummary?.investmentNet },
    { label: 'Cash flow (income − all outflows)', value: summary.cashFlow, prev: prevSummary?.cashFlow }
  ]
  const delta = (key: keyof Pick<CycleSummary, 'dailySpend' | 'billsPaid' | 'cashFlow' | 'totalAllowance'>, lowerIsBetter?: boolean): ReactNode =>
    prevSummary ? (
      <>
        <Delta value={summary[key] - prevSummary[key]} lowerIsBetter={lowerIsBetter} /> vs previous
      </>
    ) : undefined

  const days = cycleLength(cycle)
  const since = balance.since ?? today
  const block = (j: number): CSSVars => ({ '--t0': '180ms', '--j': j })

  return (
    <div className="page reports">
      <PageHead
        dateline={`Cycle ${formatDate(cycle.startDate)} – ${formatDate(cycle.endDate)} · ${days} days${summary.closingPot === null ? ` · through ${formatDate(summary.through)}` : ''}`}
        title="Reports"
        actions={
          <Field label="Cycle">
            <select
              className="input"
              value={cycleId}
              onChange={(e) => {
                setAnimate(false)
                setCycleId(e.target.value)
              }}
            >
              {[...started].reverse().map((x) => (
                <option key={x.id} value={x.id}>
                  {formatDate(x.startDate, true)} – {formatDate(x.endDate, true)}
                </option>
              ))}
            </select>
          </Field>
        }
      />

      <div className="tiles reports-kpis row-anim" style={block(0)}>
        <Kpi label="Cycle budget" value={summary.totalAllowance} currency={c} id="kpi-budget" delay={150} sub={delta('totalAllowance')} />
        <Kpi label="Daily spend" value={summary.dailySpend} currency={c} id="kpi-daily" delay={195} sub={delta('dailySpend', true)} />
        <Kpi label="Bills paid" value={summary.billsPaid} currency={c} id="kpi-bills" delay={240} sub={delta('billsPaid', true)} />
        <Kpi label="Cash flow" value={summary.cashFlow} currency={c} id="kpi-cashflow" delay={285} signed sub={delta('cashFlow')} />
      </div>

      <div className="reports-pair row-anim" style={block(1)}>
        <div className="card">
          <div className="card-title">
            <div>
              <h2>Cycle summary</h2>
              <p className="faint">
                {formatDate(cycle.startDate, true)} – {formatDate(cycle.endDate, true)}
                {prevSummary ? ' · ▲▼ compare with the previous cycle' : ''}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table reports-summary">
              <Cols cols={prevSummary ? ['auto', 'num', 'delta'] : ['auto', 'num']} />
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">This cycle</th>
                  {prevSummary ? <th className="r">vs previous</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} className="row-anim" style={{ '--t0': '320ms', '--j': i } as CSSVars}>
                    <td className={r.sub ? 'sub' : ''}>
                      {r.sub ? (
                        <span className="glyph" aria-hidden="true">
                          ↳
                        </span>
                      ) : null}
                      {r.label}
                    </td>
                    <td className="r">{r.value === null ? <span className="faint">—</span> : <Money value={r.value} />}</td>
                    {prevSummary ? (
                      <td className="r">{r.value !== null && r.prev !== undefined && r.prev !== null ? <Delta value={r.value - r.prev} lowerIsBetter={r.lowerIsBetter} /> : <span className="faint">—</span>}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.shortfallCount > 0 ? (
            <p className="faint reports-note">
              <span className="glyph" aria-hidden="true">
                !
              </span>
              {summary.shortfallCount} bill payment(s) needed money from your main balance.
            </p>
          ) : null}
        </div>

        <ChartCard
          title="Spending by category"
          subtitle={`Daily + non-daily, ${c}`}
          empty={byCat.length === 0 ? 'No spending in this cycle yet.' : null}
          legend={<Legend items={[{ label: 'Daily', color: SERIES[0] }, { label: 'Non-daily', color: SERIES[1] }]} />}
          table={{
            columns: ['Category', 'Daily', 'Non-daily', 'Total'],
            rows: byCat.map((r) => [<UserText key={r.name}>{r.name}</UserText>, formatAmount(r.daily), formatAmount(r.nonDaily), formatAmount(r.value)])
          }}
          curtain={animate}
          begin={animCat.animationBegin}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCat} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={4}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} tickFormatter={compact} />
              <YAxis type="category" dataKey="name" {...AXIS} width={120} />
              <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="daily" name="Daily" stackId="a" fill={SERIES[0]} maxBarSize={18} {...sync(animCat)} />
              <Bar dataKey="nonDaily" name="Non-daily" stackId="a" fill={SERIES[1]} stroke="var(--surface)" strokeWidth={2} maxBarSize={18} {...sync(animCat)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="row-anim" style={block(2)}>
        <ChartCard
          title="Daily spending vs per-day"
          subtitle="Bars under the dashed line fed the pot; bars over it drew from it"
          legend={<Legend items={[{ label: 'Under per-day', color: SERIES[0] }, { label: 'Over per-day', color: SERIES[1] }, { label: 'Per-day', color: 'var(--ink)', dashed: true }]} />}
          empty={daily.length === 0 ? 'No tracked days in this cycle yet.' : null}
          table={{ columns: ['Day', 'Spent', 'Per-day'], rows: daily.map((d) => [d.label, formatAmount(d.value), formatAmount(d.allowance)]) }}
          curtain={animate}
          begin={animDaily.animationBegin}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 12, right: 16 }} barCategoryGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
              <YAxis {...AXIS} tickFormatter={compact} width={48} />
              <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <ReferenceLine y={cycle.dailyAllowance} {...REF_LINE} ifOverflow="extendDomain" label={{ value: 'per-day', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10 }} />
              <Bar dataKey="value" name="Spent" radius={BAR_RADIUS} maxBarSize={22} {...sync(animDaily)}>
                {daily.map((d) => (
                  <Cell key={d.label} fill={d.over ? SERIES[1] : SERIES[0]} />
                ))}
                <LabelList dataKey="over" content={OverLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="reports-pair row-anim" style={block(3)}>
        <ChartCard
          title="Pot balance over time"
          subtitle="Last 120 days · pot after each day; today is projected"
          legend={<Legend items={[{ label: 'Pot', color: SERIES[0] }, { label: 'Deficit', color: SERIES[1] }]} />}
          empty={potLine.length === 0 ? 'No tracked days yet.' : null}
          table={{ columns: ['Day', 'Pot'], rows: potLine.map((d) => [d.projected ? `${d.label} · projected` : d.label, formatAmount(d.value)]) }}
          curtain={animate}
          begin={animPot.animationBegin}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={potLine} margin={{ top: 8, right: 16 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={32} />
              <YAxis {...AXIS} tickFormatter={compact} width={48} />
              <Tooltip content={tipSplit('Pot', 'Pot after today (projected)')} cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }} />
              <ReferenceLine y={0} {...ZERO_LINE} />
              <Area type="monotone" dataKey="pos" name="Pot" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.18} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} {...sync(animPot)} />
              <Area type="monotone" dataKey="neg" name="Deficit" stroke={SERIES[1]} strokeWidth={2} fill={SERIES[1]} fillOpacity={0.18} dot={false} activeDot={false} {...sync(animPot)} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Main balance over time"
          subtitle={
            balance.anchored ? (
              `Last ${balanceLine.length} days · end-of-day balance`
            ) : (
              <>
                <span className="eyebrow">Change since {formatDate(since, true)}</span> · not a bank balance until you set yours
              </>
            )
          }
          legend={<Legend items={[{ label: 'In credit', color: SERIES[0] }, { label: 'Overdrawn', color: SERIES[1] }]} />}
          empty={balanceLine.length === 0 ? 'No balance history yet.' : null}
          table={{ columns: ['Day', 'Balance'], rows: balanceLine.map((d) => [d.label, formatAmount(d.value)]) }}
          curtain={animate}
          begin={animBalance.animationBegin}
          actions={
            balance.anchored ? undefined : (
              <button className="btn sm" onClick={() => setAnchorOpen(true)}>
                Set your balance
              </button>
            )
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balanceLine} margin={{ top: 8, right: 16 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={32} />
              <YAxis {...AXIS} tickFormatter={compact} width={48} />
              <Tooltip content={tipSplit('Balance')} cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }} />
              <ReferenceLine y={0} {...ZERO_LINE} />
              <Area type="monotone" dataKey="pos" name="In credit" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.18} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} {...sync(animBalance)} />
              <Area type="monotone" dataKey="neg" name="Overdrawn" stroke={SERIES[1]} strokeWidth={2} fill={SERIES[1]} fillOpacity={0.18} dot={false} activeDot={false} {...sync(animBalance)} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="row-anim" style={block(4)}>
        <ChartCard
          title="Cycle over cycle"
          subtitle={`Last ${lastSix.length} cycles, ${c}`}
          legend={<Legend items={[{ label: 'Daily spend', color: SERIES[0] }, { label: 'Pot at end', color: SERIES[2] }, { label: 'Bills from main', color: SERIES[1] }]} />}
          table={{
            columns: ['Cycle start', 'Daily spend', 'Pot at end', 'Bills from main'],
            rows: cycleBars.map((r) => [r.label, formatAmount(r['Daily spend']), formatAmount(r['Pot at end']), formatAmount(r['Bills from main'])])
          }}
          curtain={animate}
          begin={animCycles.animationBegin}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cycleBars} margin={{ top: 8, right: 16 }} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={compact} width={48} />
              <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <ReferenceLine y={0} {...ZERO_LINE} />
              <Bar dataKey="Daily spend" fill={SERIES[0]} radius={BAR_RADIUS} maxBarSize={22} {...sync(animCycles)} />
              <Bar dataKey="Pot at end" fill={SERIES[2]} radius={BAR_RADIUS} maxBarSize={22} {...sync(animCycles)} />
              <Bar dataKey="Bills from main" fill={SERIES[1]} radius={BAR_RADIUS} maxBarSize={22} {...sync(animCycles)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="row-anim" style={block(5)}>
        <ChartCard
          title="Portfolio"
          subtitle="Net invested vs current value per holding"
          empty={portfolio.length === 0 ? 'No holdings yet — add them under Investments.' : null}
          legend={<Legend items={[{ label: 'Net invested', color: SERIES[0] }, { label: 'Current value', color: SERIES[2] }]} />}
          table={{
            columns: ['Holding', 'Net invested', 'Current value'],
            rows: portfolio.map((r, i) => [<UserText key={holdings[i]?.holding.id ?? r.label}>{r.label}</UserText>, formatAmount(r['Net invested']), formatAmount(r['Current value'])])
          }}
          curtain={animate}
          begin={animPortfolio.animationBegin}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={portfolio} margin={{ top: 8, right: 16 }} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={compact} width={48} />
              <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="Net invested" fill={SERIES[0]} radius={BAR_RADIUS} maxBarSize={28} {...sync(animPortfolio)} />
              <Bar dataKey="Current value" fill={SERIES[2]} radius={BAR_RADIUS} maxBarSize={28} {...sync(animPortfolio)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {anchorOpen ? <BalanceDialog onClose={() => setAnchorOpen(false)} /> : null}
    </div>
  )
}
