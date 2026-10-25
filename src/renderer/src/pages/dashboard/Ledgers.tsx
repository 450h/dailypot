/** Bills ledger (docs/09 §6.8) and the unlogged-days list (§6.9, complaint 1). */
import { useMemo, useRef, useState } from 'react'
import { formatDate, weekdayShort, type ISODate } from '@shared/dates'
import { dashboardBills, type BillRow } from '@shared/engine'
import type { Cycle } from '@shared/schema'
import type { Go } from '../../App'
import { Chip, Cols, Count, FoldLine, Money, ProgressBar, UserText, Widget, type CSSVars } from '../../components/ui'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { newId, useReady } from '../../state/app'
import { STATUS } from './shared'

const BILLS_T0 = 600
const UNLOGGED_T0 = 650

export function BillsLedger({
  cycle,
  span,
  onPay,
  onSkip,
  go,
  justPaid,
  onFlashEnd
}: {
  cycle: Cycle
  span: number
  onPay: (row: BillRow) => void
  onSkip: (row: BillRow) => void
  go: Go
  /** Instance key of the bill just marked paid: its row flashes `--pos-2` once (docs/09 §6.8). */
  justPaid?: string | null
  onFlashEnd?: () => void
}): React.JSX.Element {
  const { derived } = useReady()
  const { pot, today } = derived
  const bills = useMemo(() => dashboardBills(pot, cycle, today), [pot, cycle, today])
  const open = bills.filter((b) => b.status !== 'paid' && b.status !== 'skipped')
  const due = open.reduce((sum, b) => sum + b.amount, 0)
  const funded = open.reduce((sum, b) => sum + b.funded, 0)

  return (
    <Widget
      span={span}
      index={7}
      title="Bills"
      className="bills-widget"
      actions={
        <button type="button" className="btn sm ghost" onClick={() => go('bills')}>
          Manage bills →
        </button>
      }
    >
      {bills.length === 0 ? (
        <p className="muted">No bills due this cycle. Add your phone, gym and subscriptions under Bills so the pot can pay them.</p>
      ) : (
        <div className="table-wrap">
          <table className="table bills-table">
            {/* Folding ledger (docs/09 §4.12): at span 8 "From the pot" folds into the bill cell and the actions stack (880px); "Due" folds at 620px. */}
            <Cols cols={['auto', ['date', 2], 'num', 120, ['auto', 1], 'actions']} />
            <thead>
              <tr>
                <th>Bill</th>
                <th data-fold="2">Due</th>
                <th className="r">Amount</th>
                <th>Status</th>
                <th data-fold="1">From the pot</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b, i) => {
                const st = STATUS[b.status]
                const settled = b.status === 'paid' || b.status === 'skipped'
                const style: CSSVars = { '--t0': `${BILLS_T0}ms`, '--j': i, '--status': st.color }
                const flash = justPaid === b.instance.key
                // Rendered in the "From the pot" column and again as a fold line; only one copy is ever displayed.
                const fromPot =
                  b.status === 'paid' && b.split ? (
                    <span className="meter-text">
                      pot <Money value={b.split.fromPot} /> ·{' '}
                      {b.split.fromMain > 0 ? (
                        <span className="warn-text">
                          main <Money value={b.split.fromMain} />
                        </span>
                      ) : (
                        <>
                          main <Money value={0} />
                        </>
                      )}
                    </span>
                  ) : settled ? null : (
                    <div className="stack" style={{ gap: 3 }}>
                      <ProgressBar
                        value={b.amount > 0 ? b.funded / b.amount : 1}
                        label={`${b.instance.name} funded`}
                        tone={b.status === 'overdue' ? 'neg' : 'accent'}
                        anim
                        delay={BILLS_T0 + i * 40 + 200}
                      />
                      <span className="meter-text">
                        <Money value={b.funded} /> / <Money value={b.amount} /> funded
                      </span>
                    </div>
                  )
                return (
                  <tr key={b.instance.key} className={`row-anim${flash ? ' flash-paid' : ''}`} style={style} onAnimationEnd={flash ? (e) => e.animationName === 'flash-pos' && onFlashEnd?.() : undefined}>
                    <td>
                      <UserText>{b.instance.name}</UserText>
                      <FoldLine level={2}>
                        due <span className="mono">{formatDate(b.instance.dueDate)}</span>
                      </FoldLine>
                      {fromPot ? <FoldLine level={1}>{fromPot}</FoldLine> : null}
                    </td>
                    <td className="mono" data-fold="2">
                      {formatDate(b.instance.dueDate)}
                    </td>
                    <td className="r">
                      <Money value={b.amount} />
                    </td>
                    <td>
                      <Chip tone={st.tone} glyph={st.glyph}>
                        {st.label}
                      </Chip>
                    </td>
                    <td data-fold="1">{fromPot}</td>
                    <td className="r">
                      {!settled ? (
                        <span className="cell-actions">
                          <button type="button" className="btn sm primary" onClick={() => onPay(b)}>
                            Mark paid
                          </button>
                          <button type="button" className="btn sm ghost" onClick={() => onSkip(b)}>
                            Skip
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open.length > 0 ? (
        <p className="bills-foot">
          <span>
            Due this cycle <Count value={due} id="bills-due" delay={900} duration={700} />
          </span>
          <span>
            funded <Count value={funded} id="bills-funded" delay={900} duration={700} />
          </span>
          <span>
            from main ~<Count value={Math.max(0, due - funded)} id="bills-main" delay={900} duration={700} />
          </span>
        </p>
      ) : null}
      <p className="faint">Figures are recalculated from your history, so editing a past expense can change how past bills were split.</p>
    </Widget>
  )
}

export function UnloggedDays({ onAdd, go }: { onAdd: (date: ISODate) => void; go: Go }): React.JSX.Element {
  const { derived, run } = useReady()
  const { unlogged } = derived
  const reduced = usePrefersReducedMotion()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [leaving, setLeaving] = useState<ISODate | null>(null)
  const shown = unlogged.slice(0, 4)
  const more = unlogged.length - shown.length

  const confirm = async (date: ISODate, from: HTMLElement): Promise<void> => {
    // The button is about to be disabled and its item removed, which would drop focus to <body>: move it first
    // (to the next item's confirm button, else the widget heading) so a keyboard user keeps their place.
    const li = from.closest('li')
    const sibling = (li?.nextElementSibling ?? li?.previousElementSibling) as HTMLElement | null
    ;(sibling?.querySelector<HTMLElement>('button.primary') ?? headingRef.current)?.focus()
    setLeaving(date)
    // Let the 200ms collapse play before the list re-renders without the item.
    if (!reduced) await new Promise<void>((resolve) => window.setTimeout(resolve, 200))
    const ok = await run(window.dailypot.upsert('confirmedDays', { id: newId(), date }), 'Day confirmed')
    if (!ok) setLeaving(null)
  }

  return (
    <Widget
      span={4}
      index={8}
      className="unlogged-widget"
      title={
        <h2 className="row" style={{ gap: 8 }} ref={headingRef} tabIndex={-1}>
          Unlogged days
          <span className="nav-badge" aria-hidden="true">
            {unlogged.length}
          </span>
          <span className="sr-only">({unlogged.length})</span>
        </h2>
      }
      subtitle="Each added your full per-day to the pot"
    >
      <ul className="unlogged-list">
        {shown.map((d, j) => {
          const style: CSSVars = { '--t0': `${UNLOGGED_T0}ms`, '--j': j }
          return (
            <li key={d.date} className={`unlogged-item row-anim from-left ${leaving === d.date ? 'collapse-out' : ''}`} style={style}>
              <span className="unlogged-date">
                {weekdayShort(d.date)} {formatDate(d.date)}
              </span>
              <span className="faint">
                added your full per-day <Money value={d.allowance} /> to the pot
              </span>
              <span className="unlogged-actions">
                <button type="button" className="btn sm ghost" onClick={() => onAdd(d.date)}>
                  Add spending
                </button>
                <button type="button" className="btn sm primary" disabled={leaving === d.date} onClick={(e) => void confirm(d.date, e.currentTarget)}>
                  <span aria-hidden="true">✓</span> Spent nothing
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {more > 0 ? (
        <button type="button" className="btn sm ghost dash-link" onClick={() => go('pot')}>
          and {more} more →
        </button>
      ) : null}
    </Widget>
  )
}
