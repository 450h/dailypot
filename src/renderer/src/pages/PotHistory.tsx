/**
 * F5 — Pot history (docs/09 §8 "Pot history"): the Day Strip for the selected cycle, three stat tiles, the pot
 * line across the cycle and the per-day ledger that makes the pot explainable. Every figure is a DayRow from
 * `derived.pot` (computePot); this file only formats. Second home of the complaint-1 fix: every unlogged row has
 * an inline "✓ Spent nothing" button and the header confirms them all. Header action: "Extend tracking back".
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, diffDays, formatDate, parts, weekdayShort, type ISODate } from '@shared/dates'
import { cycleLength, validateExtendBack } from '@shared/engine'
import type { Cycle } from '@shared/schema'
import { AXIS, GRID, Legend, SERIES, Tip, ZERO_LINE, compact, useChartAnim } from '../components/Charts'
import { ExtendBackDialog } from '../components/ExtendBackDialog'
import { stripDaysFor } from '../components/stripDays'
import { TransactionForm } from '../components/TransactionForm'
import { Chip, Cols, Count, Delta, Empty, Field, FoldLine, Modal, Money, PageHead, UserText, Widget, plural, type CSSVars } from '../components/ui'
import { ChartBox, DayStrip } from '../components/viz'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { newId, useReady } from '../state/app'
import '../styles/pages/history.css'

/* Choreography (docs/09 §7): strip stamps from 250ms, tiles count from 300ms, the line draws from 450ms, rows rise from 600ms. */
const T_STRIP = 250
const T_TILES = 300
const T_CHART = 450
const T_ROWS = 600
/** Rows past this index land together, so a 31-day cycle still settles by ≈ 1.2s. */
const MAX_STAGGER = 14

interface ChartRow {
  /** The x key: the ISO date, unique even in an early-start cycle longer than a month (docs/05 §3), where day numbers repeat. */
  date: ISODate
  label: string
  pos: number
  neg: number
  balance: number
  projected: boolean
}

type AreaTipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartRow }> }

/** `focusDate`: arriving from a dashboard strip cell, open that day's cycle and jump to its row (docs/09 §6.3). */
export function PotHistory({ focusDate = null }: { focusDate?: ISODate | null }): React.JSX.Element {
  const { state, derived, run, toast } = useReady()
  const { pot, cycles, today, currency, current, unlogged } = derived
  const reduced = usePrefersReducedMotion()
  const gid = useId().replace(/:/g, '')
  const tableRef = useRef<HTMLDivElement>(null)

  const [cycleId, setCycleId] = useState(() => (focusDate ? cycles.find((c) => c.startDate <= focusDate && focusDate <= c.endDate)?.id : undefined) ?? current?.id ?? cycles.at(-1)?.id ?? '')
  const [extendOpen, setExtendOpen] = useState(false)
  const [addDate, setAddDate] = useState<ISODate | null>(null)
  const [hit, setHit] = useState<ISODate | null>(null)
  const [busy, setBusy] = useState(false)
  const closeExtend = useCallback(() => setExtendOpen(false), [])
  const closeAdd = useCallback(() => setAddDate(null), [])

  const cycle = cycles.find((c) => c.id === cycleId)
  const names = useMemo(() => new Map(state.obligations.map((o) => [o.id, o.name])), [state.obligations])
  // Chronological rows of the selected cycle (dates ≤ today only; the engine has no future rows).
  const days = useMemo(() => pot.days.filter((d) => d.cycleId === cycleId), [pot, cycleId])
  const rows = useMemo(() => [...days].reverse(), [days])
  const unloggedRows = useMemo(() => days.filter((d) => d.unlogged), [days])
  const opening = pot.cycleOpening.get(cycleId) ?? 0
  const closing = pot.cycleClosing.get(cycleId) ?? null
  const isOpen = closing === null

  // The one DayRow → cell mapping, shared with the dashboard ribbon (components/stripDays.ts).
  const stripDays = useMemo(() => (cycle ? stripDaysFor(days, cycle, today) : []), [cycle, days, today])

  // Unlogged days the sidebar badge counts (current cycle + the previous 7 days, docs/06 F2) that fall outside the
  // selected cycle, grouped by cycle: "Confirm all" is cycle-scoped, so these explain a badge that stays non-zero.
  const elsewhere = useMemo(() => {
    const byCycle = new Map<string, number>()
    for (const d of unlogged) if (d.cycleId && d.cycleId !== cycleId) byCycle.set(d.cycleId, (byCycle.get(d.cycleId) ?? 0) + 1)
    return [...byCycle].flatMap(([id, n]) => {
      const c = cycles.find((x) => x.id === id)
      return c ? [{ cycle: c, n }] : []
    }) as Array<{ cycle: Cycle; n: number }>
  }, [unlogged, cycleId, cycles])

  const chartRows = useMemo<ChartRow[]>(
    () =>
      days.map((d) => ({
        date: d.date,
        label: `${weekdayShort(d.date)} ${formatDate(d.date, true)}${d.closed ? '' : ' · projected'}`,
        pos: Math.max(0, d.balanceAfter),
        neg: Math.min(0, d.balanceAfter),
        balance: d.balanceAfter,
        projected: !d.closed
      })),
    [days]
  )
  const hasDeficit = chartRows.some((r) => r.neg < 0)
  const todayDate = chartRows.find((r) => r.projected)?.date
  const anim = useChartAnim(T_CHART, 800)

  useEffect(() => {
    if (hit === null) return
    const t = setTimeout(() => setHit(null), 1800)
    return () => clearTimeout(t)
  }, [hit])

  const jumpTo = useCallback(
    (date: ISODate): void => {
      const el = tableRef.current?.querySelector<HTMLTableRowElement>(`tr[data-date="${date}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
      el.focus({ preventScroll: true })
      setHit(date)
    },
    [reduced]
  )

  // Arriving from a dashboard strip cell: jump once the rows have risen, so the highlight is seen. The Shell remounts
  // this page per visit, so this runs once per arrival.
  useEffect(() => {
    if (!focusDate) return
    const t = setTimeout(() => jumpTo(focusDate), reduced ? 0 : T_ROWS)
    return () => clearTimeout(t)
  }, [focusDate, reduced, jumpTo])

  const confirmDay = async (date: ISODate): Promise<void> => {
    await run(window.dailypot.upsert('confirmedDays', { id: newId(), date }), `${formatDate(date)} confirmed as spent nothing`)
  }

  const confirmAll = async (): Promise<void> => {
    setBusy(true)
    try {
      let n = 0
      for (const d of unloggedRows) {
        const ok = await run(window.dailypot.upsert('confirmedDays', { id: newId(), date: d.date }))
        if (!ok) break
        n++
      }
      if (n > 0) toast(`${n} day${n === 1 ? '' : 's'} confirmed as spent nothing`)
    } finally {
      setBusy(false)
    }
  }

  const first = cycles[0]
  const canExtend = first !== undefined && validateExtendBack(cycles, addDays(first.startDate, -1), today) === null
  const extendTitle = first === undefined ? 'Finish setup first' : canExtend ? 'Add cycles before your first tracked day' : 'Tracking already starts about 3 years back'

  const picker = (
    <Field label="Cycle">
      <select className="input" value={cycleId} onChange={(e) => setCycleId(e.target.value)} disabled={cycles.length === 0}>
        {cycles.length === 0 ? <option value="">No cycles yet</option> : null}
        {[...cycles].reverse().map((c) => (
          <option key={c.id} value={c.id}>
            {formatDate(c.startDate, true)} – {formatDate(c.endDate, true)}
            {c.id === current?.id ? ' · current' : ''}
          </option>
        ))}
      </select>
    </Field>
  )
  const extendButton = (
    <button className="btn" onClick={() => setExtendOpen(true)} disabled={!canExtend} title={extendTitle}>
      Extend tracking back
    </button>
  )

  if (!cycle) {
    return (
      <div className="page">
        <PageHead dateline="NO BUDGET CYCLE" title="Pot history" actions={<>{picker}{extendButton}</>} />
        <div className="rule" />
        <Empty title="No budget cycle yet">
          <p>Finish setup to start the pot timeline. Each closed day then adds per-day − daily spending to the pot.</p>
        </Empty>
        {extendOpen ? <ExtendBackDialog onClose={closeExtend} /> : null}
      </div>
    )
  }

  const len = cycleLength(cycle)
  const dayNo = Math.min(len, Math.max(0, diffDays(cycle.startDate, today) + 1))
  const notStarted = today < cycle.startDate
  const closedDays = days.filter((d) => d.closed).length
  const dateline = [
    `CYCLE ${formatDate(cycle.startDate)} – ${formatDate(cycle.endDate, true)}`,
    `${len} DAYS`,
    notStarted ? 'NOT STARTED' : isOpen ? `DAY ${dayNo} OF ${len}` : 'CLOSED',
    unloggedRows.length > 0 ? `${unloggedRows.length} UNLOGGED` : null
  ]
    .filter((s): s is string => s !== null)
    .join(' · ')
    .toUpperCase()

  const tip = (p: unknown): React.JSX.Element | null => {
    const { active, payload } = p as AreaTipProps
    const row = payload?.[0]?.payload
    if (!active || !row) return null
    return <Tip active payload={[{ name: row.projected ? 'Pot after today (projected)' : 'Pot after', value: row.balance }]} label={row.label} currency={currency} />
  }

  return (
    <div className="page">
      <PageHead
        dateline={dateline}
        title="Pot history"
        actions={
          <>
            {picker}
            {unloggedRows.length > 0 ? (
              <button className="btn" onClick={() => void confirmAll()} disabled={busy} title="Marks every unlogged day in this cycle as spent nothing">
                {busy ? 'Confirming…' : 'Confirm all unlogged in this cycle'}
              </button>
            ) : null}
            {extendButton}
          </>
        }
      />

      <div className="rule" />
      <Widget span={12} index={0} variant="flat" className="hx-strip">
        <div className="hx-strip-head">
          <span>
            <span className="eyebrow">Cycle days</span>
            <span className="faint">click a day to jump to its row</span>
          </span>
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            {notStarted ? (
              <Chip tone="neutral" glyph="→">starts {formatDate(cycle.startDate)}</Chip>
            ) : unloggedRows.length > 0 ? (
              <Chip tone="warn" glyph="?">
                {unloggedRows.length} unlogged {unloggedRows.length === 1 ? 'day' : 'days'}
              </Chip>
            ) : closedDays > 0 ? (
              <Chip tone="ok">Every day accounted for</Chip>
            ) : null}
            {elsewhere.map((g) => (
              <button key={g.cycle.id} type="button" className="btn sm ghost" onClick={() => setCycleId(g.cycle.id)}>
                {plural(g.n, 'more unlogged day')} in {formatDate(g.cycle.startDate)} – {formatDate(g.cycle.endDate)} →
              </button>
            ))}
          </span>
        </div>
        <DayStrip days={stripDays} onPick={jumpTo} onConfirm={(d) => void confirmDay(d)} onAdd={setAddDate} progress={{ done: Math.min(len, closedDays + (isOpen && !notStarted ? 1 : 0)), total: len }} delay={T_STRIP} label="Cycle days" />
      </Widget>

      <Widget span={12} index={1} variant="flat">
        <div className="tiles">
          <div className="tile">
            <span className="stat-label">Opening pot</span>
            <span className="stat-value">
              <Count value={opening} currency={currency} id="hist-opening" delay={T_TILES} />
            </span>
            <span className="stat-sub">Rolled over from the previous cycle</span>
          </div>
          <div className="tile">
            <span className="stat-label">{isOpen ? 'Pot now' : 'Closing pot'}</span>
            <span className="stat-value">
              <Count value={closing ?? pot.balance} currency={currency} id="hist-closing" delay={T_TILES + 60} />
            </span>
            <span className="stat-sub">{isOpen ? (notStarted ? 'Cycle not started yet' : 'Cycle still open · includes today’s bill payments') : 'Carried into the next cycle'}</span>
          </div>
          <div className="tile">
            <span className="stat-label">Unlogged days</span>
            <span className={`stat-value ${unloggedRows.length > 0 ? 'warn-text' : ''}`}>
              <Count value={unloggedRows.length * 100} integer delay={T_TILES + 120} duration={600} />
            </span>
            <span className="stat-sub">{unloggedRows.length > 0 ? 'No spending recorded and not confirmed as no-spend; each added your full per-day' : 'Every closed day has entries or a no-spend confirmation'}</span>
          </div>
        </div>
      </Widget>

      <Widget span={12} index={2} title="Pot across the cycle" subtitle={isOpen && !notStarted ? 'Pot after each day; today is projected' : 'Pot after each day'}>
        {chartRows.length === 0 ? (
          <p className="muted">This cycle hasn’t started yet.</p>
        ) : (
          <>
            {hasDeficit ? (
              <Legend
                items={[
                  { label: 'pot ahead', color: SERIES[0] },
                  { label: 'pot in deficit', color: SERIES[1] }
                ]}
              />
            ) : null}
            <ChartBox height={200} delay={T_CHART} duration={800}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`${gid}-pos`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset={0} stopColor="var(--series-1)" stopOpacity={0.22} />
                      <stop offset={1} stopColor="var(--series-1)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id={`${gid}-neg`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset={0} stopColor="var(--series-2)" stopOpacity={0.02} />
                      <stop offset={1} stopColor="var(--series-2)" stopOpacity={0.22} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" minTickGap={14} tickFormatter={(d: string) => String(parts(d).d)} />
                  <YAxis {...AXIS} tickFormatter={compact} width={48} />
                  <Tooltip content={tip} cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }} />
                  <ReferenceLine y={0} {...ZERO_LINE} />
                  {todayDate ? <ReferenceLine x={todayDate} stroke="var(--ink-2)" strokeDasharray="3 3" label={{ value: 'today', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10 }} /> : null}
                  <Area type="monotone" dataKey="pos" name="Pot after" baseValue={0} stroke="var(--series-1)" strokeWidth={2} fill={`url(#${gid}-pos)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} {...anim} />
                  {hasDeficit ? <Area type="monotone" dataKey="neg" name="Deficit" baseValue={0} stroke="var(--series-2)" strokeWidth={2} fill={`url(#${gid}-neg)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} {...anim} /> : null}
                </AreaChart>
              </ResponsiveContainer>
            </ChartBox>
          </>
        )}
      </Widget>

      <Widget span={12} index={3} title="Day by day" subtitle="Newest first. Each closed day adds per-day − daily spending to the pot; bills paid that day draw from the pot first, nearest due date first.">
        {rows.length === 0 ? (
          <p className="muted">This cycle hasn’t started yet.</p>
        ) : (
          <div className="table-wrap" ref={tableRef}>
            <table className="table hx-table">
              {/* Folding ledger (docs/09 §4.12): per-day folds at 880px, delta at 620px, both into the date cell. */}
              <Cols cols={[160, ['num', 1], 'num', ['delta', 2], 'auto', 'num']} />
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="r" data-fold="1">
                    Per-day
                  </th>
                  <th scope="col" className="r">Daily spent</th>
                  <th scope="col" className="r" data-fold="2">
                    Delta
                  </th>
                  <th scope="col">Bill payments</th>
                  <th scope="col" className="r">Pot after</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const style: CSSVars = { '--t0': `${T_ROWS}ms`, '--j': Math.min(i, MAX_STAGGER), ...(d.unlogged ? { '--status': 'var(--warn)' } : {}) }
                  const chip = !d.closed ? (
                    <Chip tone="info" glyph="●">
                      today (projected)
                    </Chip>
                  ) : d.unlogged ? (
                    <Chip tone="warn" glyph="?" title="No spending recorded and not confirmed as no-spend: the full per-day went to the pot">
                      unlogged
                    </Chip>
                  ) : d.confirmed && d.spent === 0 ? (
                    <Chip tone="neutral" glyph="✓">
                      no spend
                    </Chip>
                  ) : null
                  return (
                    <tr key={d.date} data-date={d.date} tabIndex={-1} className={`row-anim ${hit === d.date ? 'hx-hit' : ''}`} style={style}>
                      <td className="hx-date">
                        <div className="hx-day">
                          <span className="hx-when">
                            <span className="mono">{formatDate(d.date)}</span>
                            <span className="faint">{weekdayShort(d.date)}</span>
                          </span>
                          {chip ? <span className="hx-chips">{chip}</span> : null}
                          <FoldLine level={1}>
                            per-day <Money value={d.allowance} />
                          </FoldLine>
                          <FoldLine level={2}>
                            delta <Delta value={d.delta} />
                          </FoldLine>
                          {d.unlogged ? (
                            <span className="hx-confirm">
                              <button className="btn sm" onClick={() => void confirmDay(d.date)} disabled={busy}>
                                <span aria-hidden="true">✓</span> Spent nothing
                              </button>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="r" data-fold="1">
                        <Money value={d.allowance} />
                      </td>
                      <td className="r">
                        <Money value={d.spent} />
                      </td>
                      <td className="r" data-fold="2">
                        <Delta value={d.delta} />
                      </td>
                      <td className="hx-pay">
                        {d.payments.map((p) => (
                          <div key={p.paymentId} className="hx-pay-line">
                            <UserText>{names.get(p.obligationId) ?? 'Bill'}</UserText> <Money value={p.amount} />{' '}
                            <span className="hx-pay-split">
                              · pot <Money value={p.fromPot} />
                              {p.fromMain > 0 ? (
                                <>
                                  {' '}
                                  <span className="hx-main">
                                    · <span className="glyph" aria-hidden="true">!</span>main <Money value={p.fromMain} />
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="r hx-after">
                        <Money value={d.balanceAfter} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint">All amounts in {currency}. Figures are recalculated from your history; the pot is never stored.</p>
      </Widget>

      {extendOpen ? <ExtendBackDialog onClose={closeExtend} /> : null}
      {addDate ? (
        <Modal title={`Add spending · ${formatDate(addDate, true)}`} onClose={closeAdd}>
          <TransactionForm initialDate={addDate} onDone={closeAdd} />
        </Modal>
      ) : null}
    </div>
  )
}
