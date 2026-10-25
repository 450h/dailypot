/**
 * Visual atoms (docs/09 §6): Ring, DayStrip, StackedBar, Spark, Curtain, ChartBox.
 * Inline SVG + Recharts only; every colour is a token; every entrance honours reduced motion.
 * No money math here: callers pass engine results (fractions, minor units) and labels.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate, type ISODate } from '@shared/dates'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { tipFor, useChartAnim } from './Charts'
import { displayAmount, type CSSVars } from './ui'

/* ------------------------------------------------------------------------------------------------
   Curtain + ChartBox (docs/09 §7.4)
   ------------------------------------------------------------------------------------------------ */

/** Left-to-right reveal over a chart box. Hidden under reduced motion. `delay` = the chart's animationBegin. */
export function Curtain({ delay = 0, duration = 800 }: { delay?: number; duration?: number }): React.JSX.Element | null {
  const reduced = usePrefersReducedMotion()
  if (reduced) return null
  return <div className="curtain" aria-hidden style={{ animationDelay: `${delay}ms`, animationDuration: `${duration}ms` }} />
}

/** Fixed-height box for a Recharts chart (`ResponsiveContainer` inside). Heights: 260 default · 220 rhythm · 72 pot spark · 56 masthead spark. */
export function ChartBox({ height = 260, curtain = true, delay = 0, duration = 800, className, children }: { height?: number; curtain?: boolean; delay?: number; duration?: number; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={`chart-box ${className ?? ''}`} style={{ height, minHeight: height }}>
      {children}
      {curtain ? <Curtain delay={delay} duration={duration} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
   Ring (docs/09 §6.4)
   ------------------------------------------------------------------------------------------------ */

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/**
 * Progress ring. `value` 0..1 = spent / per-day (clamped); `over` 0..1 = overflow fraction when spent > per-day
 * (turns the fill warm and draws a 3px outer arc); `marker` 0..1 = the safe-to-spend tick (a 2px `--warn` tick
 * labelled `safe`), null to hide. `label` is the SVG's accessible name; `children` sit in the centre.
 * Draws itself via stroke-dashoffset from `delay` (default 220ms) over `duration` (800ms).
 */
export function Ring({
  value,
  over = 0,
  marker = null,
  label,
  size = 148,
  stroke = 10,
  delay = 220,
  duration = 800,
  children
}: {
  value: number
  over?: number
  marker?: number | null
  label: string
  size?: number
  stroke?: number
  delay?: number
  duration?: number
  children?: ReactNode
}): React.JSX.Element {
  const c = size / 2
  const r = c - stroke / 2 - 6
  const circ = 2 * Math.PI * r
  const v = clamp01(value)
  const o = clamp01(over)
  const r2 = r + stroke / 2 + 3
  const circ2 = 2 * Math.PI * r2
  const neg = o > 0 || value > 1
  const tick = marker === null ? null : (() => {
    const a = (clamp01(marker) * 360 - 90) * (Math.PI / 180)
    const inner = r - stroke / 2 - 3
    const outer = r + stroke / 2 + 3
    const lx = c + (outer + 10) * Math.cos(a)
    const ly = c + (outer + 10) * Math.sin(a)
    const anchor: 'start' | 'middle' | 'end' = Math.cos(a) < -0.3 ? 'end' : Math.cos(a) > 0.3 ? 'start' : 'middle'
    return { x1: c + inner * Math.cos(a), y1: c + inner * Math.sin(a), x2: c + outer * Math.cos(a), y2: c + outer * Math.sin(a), lx, ly, anchor }
  })()
  const style: CSSVars = { '--t0': `${delay}ms`, '--t1': `${delay + duration - 100}ms`, '--ring-dur': `${duration}ms`, width: size, height: size }
  return (
    <div className={`ring ${neg ? 'neg' : ''}`} style={style}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle className="ring-track" cx={c} cy={c} r={r} strokeWidth={stroke} />
        {v > 0 ? (
          <circle
            className="ring-fill"
            cx={c}
            cy={c}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - v)}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ '--circ': circ } as CSSVars}
          />
        ) : null}
        {o > 0 ? (
          <circle
            className="ring-over"
            cx={c}
            cy={c}
            r={r2}
            strokeWidth={3}
            strokeDasharray={circ2}
            strokeDashoffset={circ2 * (1 - o)}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ '--circ': circ2 } as CSSVars}
          />
        ) : null}
        {tick ? (
          <>
            <line className="ring-tick" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
            <text className="ring-tick-label" x={tick.lx} y={tick.ly} textAnchor={tick.anchor} dominantBaseline="middle">
              safe
            </text>
          </>
        ) : null}
      </svg>
      {children ? <div className="ring-centre">{children}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
   Day Strip (docs/09 §6.3)
   ------------------------------------------------------------------------------------------------ */

export type StripState = 'fed' | 'confirmed' | 'drew' | 'unlogged' | 'today' | 'future'

export interface StripDay {
  date: ISODate
  state: StripState
  /** Accessible name + tooltip, e.g. `Tue 14 Oct, spent 52.00, 18.00 to the pot`. */
  label: string
  delta?: number
  spent?: number
}

const LEGEND: Array<{ state: StripState; glyph: string; text: string }> = [
  { state: 'fed', glyph: '', text: 'fed the pot' },
  { state: 'drew', glyph: '▲', text: 'drew from it' },
  { state: 'unlogged', glyph: '?', text: 'unlogged' },
  { state: 'today', glyph: '', text: 'today' },
  { state: 'future', glyph: '', text: 'future' }
]

/**
 * One cell per cycle day, encoded by shape + colour (never colour alone). Closed days, today and unlogged days
 * are <button>s with `aria-label`; future days are `aria-hidden` spans. Cells stamp in with an 18ms stagger
 * (`--d`) from `delay` (350ms). Unlogged cells open a two-action popover (`✓ Spent nothing` → `onConfirm`,
 * `Add spending` → `onAdd`) when either handler is given; otherwise every interactive cell calls `onPick`.
 * `progress` draws the 2px hairline with an ink segment for done / total; `legend` shows the glyph key.
 */
export function DayStrip({
  days,
  onPick,
  onConfirm,
  onAdd,
  legend = true,
  progress,
  cell = 24,
  delay = 350,
  label = 'Cycle days'
}: {
  days: StripDay[]
  onPick?: (date: ISODate, state: StripState) => void
  onConfirm?: (date: ISODate) => void
  onAdd?: (date: ISODate) => void
  legend?: boolean
  progress?: { done: number; total: number }
  cell?: number
  delay?: number
  label?: string
}): React.JSX.Element {
  const [open, setOpen] = useState<ISODate | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const popId = useId()
  const popover = Boolean(onConfirm || onAdd)

  /** Closes the popover and puts focus back on its cell (which survives as `confirmed`), so a keyboard user keeps their place. */
  const closeTo = (date: ISODate): void => {
    setOpen(null)
    wrap.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus()
  }

  useEffect(() => {
    if (open === null) return
    const onDown = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(null)
        wrap.current?.querySelector<HTMLElement>(`[data-date="${open}"]`)?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const stripStyle: CSSVars = { '--days': days.length, '--cell': `${cell}px`, '--t0': `${delay}ms` }
  return (
    <div className="strip-wrap" ref={wrap}>
      <div className="strip" style={stripStyle} role="group" aria-label={label}>
        {days.map((d, i) => {
          const style: CSSVars = { '--d': i }
          if (d.state === 'future')
            return (
              <span className="strip-slot" key={d.date}>
                <span className="strip-cell future" style={style} aria-hidden="true" />
              </span>
            )
          const isPop = d.state === 'unlogged' && popover
          const expanded = isPop && open === d.date
          return (
            <span className="strip-slot" key={d.date}>
              <button
                type="button"
                className={`strip-cell ${d.state}`}
                style={style}
                data-date={d.date}
                aria-label={d.label}
                title={d.label}
                aria-expanded={isPop ? expanded : undefined}
                aria-controls={expanded ? popId : undefined}
                onClick={() => {
                  if (isPop) setOpen(expanded ? null : d.date)
                  else onPick?.(d.date, d.state)
                }}
              />
              {expanded ? (
                <div id={popId} className="strip-pop" role="group" aria-label={`${formatDate(d.date, true)}: unlogged day`}>
                  <p className="dateline">{formatDate(d.date, true)} · unlogged</p>
                  {onConfirm ? (
                    <button
                      type="button"
                      className="btn sm primary"
                      autoFocus
                      onClick={() => {
                        closeTo(d.date)
                        onConfirm(d.date)
                      }}
                    >
                      <span aria-hidden="true">✓</span> Spent nothing
                    </button>
                  ) : null}
                  {onAdd ? (
                    <button
                      type="button"
                      className="btn sm"
                      autoFocus={!onConfirm}
                      onClick={() => {
                        closeTo(d.date)
                        onAdd(d.date)
                      }}
                    >
                      Add spending
                    </button>
                  ) : null}
                </div>
              ) : null}
            </span>
          )
        })}
      </div>
      {progress && progress.total > 0 ? (
        <div className="strip-progress" style={{ '--t0': `${delay}ms` } as CSSVars} aria-hidden="true">
          <span style={{ width: `${Math.round(clamp01(progress.done / progress.total) * 100)}%` }} />
        </div>
      ) : null}
      {legend ? (
        <div className="strip-legend" aria-hidden="true">
          {LEGEND.map((l) => (
            <span key={l.state}>
              <span className={`strip-key ${l.state}`}>{l.glyph}</span>
              {l.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
   Stacked bar (docs/09 §6.2, §6.6)
   ------------------------------------------------------------------------------------------------ */

export interface BarSegment {
  key: string
  label: string
  /** Minor units; magnitude is used for width. */
  value: number
  /** A token, e.g. `var(--series-1)` or `var(--ink-2)`. */
  color: string
  /** Drawn with 1px ink hatching left of a zero tick (negative cash). */
  hatched?: boolean
}

/**
 * Inline-SVG stacked bar: squared ends, 2px `--surface` gaps (a stroke), segments `scaleX` 0→1 from the left
 * in order (`delay` start, `stagger` apart). `total` defaults to Σ|value|. `labels` prints name + amount under
 * at most five segments that are ≥ 6% wide (the rest belong in the legend / table toggle).
 * Pass `label` for the accessible summary; omitted, it is built from the segments.
 */
/** Estimated glyph widths of the direct labels (11px eyebrow with tracking, 12px mono amount): only used to keep labels from colliding. */
const LABEL_CH = 7.6
const AMOUNT_CH = 7.3
const LABEL_GAP = 8

export function StackedBar({
  segments,
  total,
  height = 10,
  labels = false,
  delay = 400,
  stagger = 80,
  label
}: {
  segments: BarSegment[]
  total?: number
  height?: number
  labels?: boolean
  delay?: number
  stagger?: number
  label?: string
}): React.JSX.Element {
  const patternId = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(0)
  // Direct labels need the rendered width to know which ones fit. The observer reports after layout, so nothing is read during render.
  useEffect(() => {
    if (!labels) return
    const el = svgRef.current
    if (!el) return
    // An outer <svg> is observed by its bounding box, so read the laid-out CSS width instead of contentRect.
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [labels])
  const visible = segments.filter((s) => s.value !== 0)
  const sum = total ?? visible.reduce((acc, s) => acc + Math.abs(s.value), 0)
  const ordered = [...visible.filter((s) => s.hatched), ...visible.filter((s) => !s.hatched)]
  const hasNeg = ordered.some((s) => s.hatched)
  const negShare = hasNeg ? ordered.filter((s) => s.hatched).reduce((acc, s) => acc + Math.abs(s.value), 0) / Math.max(1, sum) : 0
  let x = 0
  const placed = ordered.map((s, j) => {
    const w = sum > 0 ? Math.abs(s.value) / sum : 0
    const seg = { ...s, j, x, w }
    x += w
    return seg
  })
  // Direct labels (09 §6.6): at most five, on segments ≥ 6% wide, left to right wherever the estimated text fits before the next
  // label and inside the bar; a label that would run past the right edge may end-align instead. The rest live in the legend.
  const labelled: Array<(typeof placed)[number] & { anchor: 'start' | 'end' }> = []
  if (labels && width > 0) {
    let lastEnd = -Infinity
    for (const s of placed) {
      if (labelled.length >= 5 || s.w < 0.06) continue
      const need = Math.max(s.label.length * LABEL_CH, displayAmount(s.value).length * AMOUNT_CH)
      const start = s.x * width
      const end = (s.x + s.w) * width
      if (start >= lastEnd + LABEL_GAP && start + need <= width) {
        labelled.push({ ...s, anchor: 'start' })
        lastEnd = start + need
      } else if (end - need >= lastEnd + LABEL_GAP && end <= width + 0.5) {
        labelled.push({ ...s, anchor: 'end' })
        lastEnd = end
      }
    }
  }
  const labelH = labels ? 34 : 0
  const svgH = height + labelH
  const summary = label ?? visible.map((s) => `${s.label} ${displayAmount(s.value)}`).join('; ')
  const style: CSSVars = { '--t0': `${delay}ms`, '--stagger': `${stagger}ms`, '--t1': `${delay + placed.length * stagger + 300}ms` }
  return (
    <svg ref={svgRef} className="flow" height={svgH} role="img" aria-label={summary} style={style}>
      {hasNeg ? (
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="1" height="6" fill="var(--ink)" />
          </pattern>
        </defs>
      ) : null}
      {sum === 0 ? <rect x="0" y="0" width="100%" height={height} fill="var(--surface-2)" /> : null}
      {placed.map((s) => (
        <rect
          key={s.key}
          className="flow-seg"
          style={{ '--j': s.j } as CSSVars}
          x={`${(s.x * 100).toFixed(3)}%`}
          y={0}
          width={`${(s.w * 100).toFixed(3)}%`}
          height={height}
          fill={s.hatched ? `url(#${patternId})` : s.color}
          stroke="var(--surface)"
          strokeWidth={2}
          shapeRendering="crispEdges"
        />
      ))}
      {hasNeg ? <line className="flow-tick" x1={`${(negShare * 100).toFixed(3)}%`} x2={`${(negShare * 100).toFixed(3)}%`} y1={-2} y2={height + 2} stroke="var(--ink)" strokeWidth={2} /> : null}
      {labelled.map((s) => {
        const x = `${((s.anchor === 'end' ? s.x + s.w : s.x) * 100).toFixed(3)}%`
        return (
          <g key={`l-${s.key}`}>
            <text className="flow-label" x={x} y={height + 14} textAnchor={s.anchor}>
              {s.label}
            </text>
            <text className="flow-amount" x={x} y={height + 28} textAnchor={s.anchor}>
              {displayAmount(s.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------------------------------------
   Spark (docs/09 §6.1, §6.5)
   ------------------------------------------------------------------------------------------------ */

export interface SparkPoint {
  date: ISODate
  value: number
}

/**
 * Duotone sparkline: a Recharts AreaChart with no axes; a zero line in `--ink`; the stroke and fill switch from
 * cool (`--series-1`, above zero) to warm (`--series-2`, below zero) exactly at the zero crossing via a split
 * gradient. `references` draw dashed labelled thresholds (the pot's next bill). `dot` marks the last point.
 * `currency` enables the tooltip. Wrapped in its own ChartBox (height, curtain synced to `begin`).
 */
export function Spark({
  data,
  height = 56,
  begin = 300,
  duration = 900,
  currency,
  references = [],
  dot = true,
  name = 'Balance',
  curtain = true
}: {
  data: SparkPoint[]
  height?: number
  begin?: number
  duration?: number
  currency?: string
  references?: Array<{ y: number; label?: string }>
  dot?: boolean
  name?: string
  curtain?: boolean
}): React.JSX.Element {
  const gid = useId().replace(/:/g, '')
  const anim = useChartAnim(begin, duration)
  // Stable identity: Recharts re-dispatches its data and replays the area animation whenever this array changes.
  const rows = useMemo(() => data.map((p) => ({ label: formatDate(p.date), value: p.value })), [data])
  const values = rows.map((p) => p.value).concat(references.map((r) => r.y))
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min
  // Offset of the zero line within the plotted range (0 = top, 1 = bottom).
  const split = span <= 0 ? 1 : max / span
  const last = rows.at(-1)
  const tip = tipFor(currency ?? '')
  return (
    <ChartBox height={height} curtain={curtain} delay={begin} duration={duration} className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={split} stopColor="var(--series-1)" />
              <stop offset={split} stopColor="var(--series-2)" />
            </linearGradient>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--series-1)" stopOpacity={0.18} />
              <stop offset={split} stopColor="var(--series-1)" stopOpacity={0} />
              <stop offset={split} stopColor="var(--series-2)" stopOpacity={0} />
              <stop offset={1} stopColor="var(--series-2)" stopOpacity={0.18} />
            </linearGradient>
          </defs>
          <XAxis hide dataKey="label" />
          <YAxis hide domain={[min, max === min ? min + 1 : max]} />
          {currency ? <Tooltip content={tip} cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }} /> : null}
          <ReferenceLine y={0} stroke="var(--ink)" strokeWidth={1} />
          {references.map((r) => (
            <ReferenceLine
              key={`${r.y}-${r.label ?? ''}`}
              y={r.y}
              stroke="var(--ink-2)"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={r.label ? { value: r.label, position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' } : undefined}
            />
          ))}
          <Area type="monotone" dataKey="value" name={name} baseValue={0} stroke={`url(#${gid}-stroke)`} strokeWidth={2} fill={`url(#${gid}-fill)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} {...anim} />
          {dot && last ? <ReferenceDot x={last.label} y={last.value} r={4} fill={last.value < 0 ? 'var(--series-2)' : 'var(--series-1)'} stroke="var(--surface)" strokeWidth={2} /> : null}
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}
