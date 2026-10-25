/**
 * Chart building blocks (docs/09 §2.4, §7.4; dataviz rules): one y-axis, thin marks, recessive grid,
 * hover tooltips with text tokens, legend for ≥ 2 series, a table view on every chart, and a
 * curtain reveal. Series colours are the fixed duotone-first palette; never cycle them.
 */
import { useState, type ReactNode } from 'react'
import { formatAmount } from '@shared/money'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { Cols, FoldLine, type ColSpec } from './ui'

/**
 * Fixed-order data series (docs/09 §2). 1 ultramarine = cool / kept / under · 2 burnt orange = warm /
 * spent / over · 3 teal · 4 gold · 5 violet · 6 raspberry. Forbidden adjacencies: s1↔s5, s2↔s4, s2↔s6.
 */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'] as const

export const AXIS = { stroke: 'var(--text-3)', fontSize: 11, tickLine: false, axisLine: false } as const
export const GRID = { stroke: 'var(--grid)', vertical: false } as const
/** Dashed 2px ink reference line (per-day line, thresholds). */
export const REF_LINE = { stroke: 'var(--ink)', strokeDasharray: '4 4', strokeWidth: 2 } as const
/** Solid ink zero line. */
export const ZERO_LINE = { stroke: 'var(--ink)', strokeWidth: 1 } as const

export const compact = (minor: number): string => {
  const v = minor / 100
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(v / 1000)}k`
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

export interface ChartAnim {
  isAnimationActive: boolean
  animationDuration: number
  animationEasing: 'ease-out'
  animationBegin: number
}

/**
 * Recharts animation props that honour reduced motion (docs/09 §7.4). Spread onto <Bar>, <Area>, <Line>:
 * `<Bar {...useChartAnim(700, 700)} />`. `begin` = the widget's delay; `duration` 700 bars / 900 lines & areas.
 */
export function useChartAnim(begin = 0, duration = 900): ChartAnim {
  const reduced = usePrefersReducedMotion()
  return { isAnimationActive: !reduced, animationDuration: duration, animationEasing: 'ease-out', animationBegin: reduced ? 0 : begin }
}

export interface TipEntry {
  name?: string | number
  value?: number | string | Array<number | string>
  color?: string
}

/** What Recharts hands a `<Tooltip content>` callback (typed loosely upstream, so callers cast `unknown` to this). */
export type TipProps = { active?: boolean; payload?: readonly TipEntry[]; label?: ReactNode }

/** Tooltip body: text in text tokens, identity via swatch (never coloured text). */
export function Tip({ active, payload, label, currency }: TipProps & { currency: string }): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div className="tip-row" key={i}>
          <span className="row" style={{ gap: 6 }}>
            {payload.length > 1 ? <span className="swatch" style={{ background: p.color }} /> : null}
            {p.name}
          </span>
          <span className="num">
            {typeof p.value === 'number' ? formatAmount(p.value) : String(p.value)} {currency}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The default tooltip for a chart: `<Tooltip content={tipFor(currency)} />`. */
export const tipFor =
  (currency: string) =>
  (p: unknown): React.JSX.Element | null => <Tip {...(p as TipProps)} currency={currency} />

/** The chart ↔ table switch every chart carries (docs/09 §9.2). */
export function TableToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button type="button" className="btn sm ghost" onClick={onToggle} aria-pressed={asTable}>
      {asTable ? 'Show chart' : 'Show table'}
    </button>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean; hatched?: boolean }> }): React.JSX.Element {
  return (
    <div className="legend" aria-hidden>
      {items.map((i) => (
        <span key={i.label}>
          {i.dashed ? (
            <span style={{ width: 14, borderTop: `2px dashed ${i.color}`, display: 'inline-block' }} />
          ) : (
            <span className={`swatch ${i.hatched ? 'hatched' : ''}`} style={i.hatched ? undefined : { background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export interface TableSpec {
  columns: string[]
  rows: Array<Array<ReactNode>>
}

/**
 * Card with a rule header, optional legend, a chart/table toggle and a curtain reveal.
 * `height` fixes the chart box (default 260) so ResponsiveContainer's zero-size first frame never shows.
 * `begin` delays the curtain to match the chart's `animationBegin`.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  empty,
  height = 260,
  curtain = true,
  begin = 0,
  actions,
  children
}: {
  title: string
  subtitle?: ReactNode
  legend?: ReactNode
  table: TableSpec
  empty?: string | null
  height?: number
  curtain?: boolean
  begin?: number
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const [asTable, setAsTable] = useState(false)
  const reduced = usePrefersReducedMotion()
  // Folding ledger (docs/09 §4.12): with four or more columns the middle numeric ones fold under the first cell at 620px.
  const n = table.columns.length
  const folds = (j: number): boolean => n >= 4 && j > 0 && j < n - 1
  const cols: ColSpec[] = table.columns.map((_, j) => (j === 0 ? 'auto' : folds(j) ? (['num', 2] as const) : 'num'))
  return (
    <div className="card">
      <div className="card-title">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="faint">{subtitle}</p> : null}
        </div>
        {!empty ? (
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            {actions}
            <TableToggle asTable={asTable} onToggle={() => setAsTable(!asTable)} />
          </span>
        ) : null}
      </div>
      {empty ? (
        <p className="muted">{empty}</p>
      ) : asTable ? (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table">
            <Cols cols={cols} />
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={i > 0 ? 'r' : ''} data-fold={folds(i) ? 2 : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) =>
                    j === 0 ? (
                      <td key={j}>
                        {cell}
                        {r.map((other, k) =>
                          folds(k) ? (
                            <FoldLine key={k} level={2}>
                              {table.columns[k]} <span className="num">{other}</span>
                            </FoldLine>
                          ) : null
                        )}
                      </td>
                    ) : (
                      <td key={j} className="r num" data-fold={folds(j) ? 2 : undefined}>
                        {cell}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend}
          <div className="chart-box" style={{ height, minHeight: height }}>
            {children}
            {curtain && !reduced ? <div className="curtain" aria-hidden style={{ animationDelay: `${begin}ms` }} /> : null}
          </div>
        </>
      )}
    </div>
  )
}
