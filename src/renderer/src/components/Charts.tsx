/**
 * Chart building blocks (dataviz skill): one y-axis, thin marks, recessive grid, hover tooltips,
 * legend for ≥ 2 series, and a table view on every chart (relief for low-contrast slots).
 */
import { useState, type ReactNode } from 'react'
import { formatAmount } from '@shared/money'

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const
export const AXIS = { stroke: 'var(--text-3)', fontSize: 11, tickLine: false, axisLine: false } as const
export const GRID = { stroke: 'var(--grid)', vertical: false } as const

export const compact = (minor: number): string => {
  const v = minor / 100
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(v / 1000)}k`
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

export interface TipEntry {
  name?: string | number
  value?: number | string | Array<number | string>
  color?: string
}

/** Tooltip body: text in text tokens, identity via swatch (never colored text). */
export function Tip({ active, payload, label, currency }: { active?: boolean; payload?: readonly TipEntry[]; label?: ReactNode; currency: string }): React.JSX.Element | null {
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

export function Legend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }): React.JSX.Element {
  return (
    <div className="legend" aria-hidden>
      {items.map((i) => (
        <span key={i.label}>
          {i.dashed ? (
            <span style={{ width: 14, borderTop: `2px dashed ${i.color}`, display: 'inline-block' }} />
          ) : (
            <span className="swatch" style={{ background: i.color }} />
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

/** Card with title, optional legend, and a chart/table toggle. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  empty,
  children
}: {
  title: string
  subtitle?: ReactNode
  legend?: ReactNode
  table: TableSpec
  empty?: string | null
  children: ReactNode
}): React.JSX.Element {
  const [asTable, setAsTable] = useState(false)
  return (
    <div className="card">
      <div className="card-title">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="faint">{subtitle}</p> : null}
        </div>
        {!empty ? (
          <button className="btn sm ghost" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        ) : null}
      </div>
      {empty ? (
        <p className="muted">{empty}</p>
      ) : asTable ? (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={i > 0 ? 'r' : ''}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className={j > 0 ? 'r num' : ''}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend}
          <div className="chart-box">{children}</div>
        </>
      )}
    </div>
  )
}
