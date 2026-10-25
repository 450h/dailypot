/**
 * F2 — Dashboard: the daily broadsheet (docs/09 §6). Composition only: every figure comes from the
 * engine through `derived`, every write goes through `run()`. Remounted per visit by the Shell, so the
 * "goes to print" choreography replays on every entry.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { diffDays, formatDate, weekdayShort } from '@shared/dates'
import { cycleLength, type BillRow } from '@shared/engine'
import type { Go } from '../App'
import { BalanceDialog } from '../components/BalanceDialog'
import { PayDialog, SkipDialog } from '../components/BillActions'
import { TransactionForm, type SavedTransaction } from '../components/TransactionForm'
import { Banner, Money, PageHead, Widget } from '../components/ui'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReady } from '../state/app'
import { Rhythm, WhereItWent } from './dashboard/Analysis'
import { CycleFlow, PotWidget, TodayRing } from './dashboard/Figures'
import { BillsLedger, UnloggedDays } from './dashboard/Ledgers'
import { Masthead, NetWorthWidget } from './dashboard/Masthead'
import { Nudges } from './dashboard/Nudges'
import { GoalsWidget, InvestmentsWidget } from './dashboard/Portfolio'
import { AllowanceDialog, DayStripRibbon, EarlyStartDialog } from './dashboard/Ribbon'
import '../styles/pages/dashboard.css'

interface Receipt {
  id: string
  amount: number
  kind: SavedTransaction['kind']
  category: string
  at: number
}

interface Drop {
  x: number
  y: number
  tx: number
  ty: number
}

const centre = (r: DOMRect): { x: number; y: number } => ({ x: r.left + r.width / 2 - 5, y: r.top + r.height / 2 - 5 })

export function Dashboard({ go }: { go: Go }): React.JSX.Element {
  const { derived, meta, run } = useReady()
  const { current, pot, today, unlogged, categories } = derived
  const reduced = usePrefersReducedMotion()

  const [anchorOpen, setAnchorOpen] = useState(false)
  const [allowanceOpen, setAllowanceOpen] = useState(false)
  const [earlyOpen, setEarlyOpen] = useState(false)
  const [pay, setPay] = useState<BillRow | null>(null)
  const [skip, setSkip] = useState<BillRow | null>(null)
  const [justPaid, setJustPaid] = useState<string | null>(null)
  const [qa, setQa] = useState<{ key: number; date: string | null }>({ key: 0, date: null })
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const potRef = useRef<HTMLSpanElement>(null)
  const dropRef = useRef<HTMLSpanElement>(null)

  // Receipt lives 8s (docs/09 §6.7).
  useEffect(() => {
    if (!receipt) return
    const t = window.setTimeout(() => setReceipt(null), 8000)
    return () => window.clearTimeout(t)
  }, [receipt])

  // Ink drop: rendered at the amount field, sent to the pot figure on the next frame (transform only), removed after it lands.
  useEffect(() => {
    if (!drop) return
    const el = dropRef.current
    const raf = requestAnimationFrame(() => {
      if (!el) return
      el.style.transform = `translate(${drop.tx}px, ${drop.ty}px)`
      el.style.opacity = '0'
    })
    const t = window.setTimeout(() => setDrop(null), 650)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [drop])

  const scrollToBar = useCallback((): void => {
    barRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  }, [reduced])

  /** Prefill the quick add with a day (remounts the form, which focuses the amount) and bring it into view. */
  const prefill = useCallback(
    (date: string | null): void => {
      setQa((q) => ({ key: q.key + 1, date }))
      scrollToBar()
    },
    [scrollToBar]
  )

  const focusQuickAdd = useCallback((): void => {
    barRef.current?.querySelector<HTMLInputElement>('input.num')?.focus()
    scrollToBar()
  }, [scrollToBar])

  const spentToday = pot.days.find((d) => d.date === today)?.spent ?? 0
  const onSaved = (item: SavedTransaction): void => {
    setReceipt({ id: item.id, amount: item.amount, kind: item.kind, category: categories.get(item.categoryId)?.name ?? 'Uncategorised', at: Date.now() })
    if (reduced || !current || item.kind !== 'daily' || item.date !== today) return
    // Under budget after this save? (today's spend before the save + the amount, against the per-day; display only)
    if (spentToday + item.amount > current.dailyAllowance) return
    const from = barRef.current?.querySelector<HTMLInputElement>('input.num')?.getBoundingClientRect()
    const to = potRef.current?.getBoundingClientRect()
    if (!from || !to) return
    const a = centre(from)
    const b = centre(to)
    setDrop({ x: a.x, y: a.y, tx: b.x, ty: b.y })
  }

  const undo = async (): Promise<void> => {
    if (!receipt) return
    const ok = await run(window.dailypot.remove('transactions', receipt.id), 'Removed')
    if (ok) setReceipt(null)
  }

  const weekday = weekdayShort(today).toUpperCase()
  const dateText = formatDate(today, true).toUpperCase()
  const title = <>Today · {formatDate(today, true)}</>

  if (!current) {
    return (
      <div className="page dashboard">
        <PageHead dateline={`${weekday} ${dateText} · NO CYCLE COVERS TODAY`} title={title} />
        <div className="bento">
          <Masthead onAnchor={() => setAnchorOpen(true)} />
          <NetWorthWidget onAnchor={() => setAnchorOpen(true)} />
        </div>
        <Banner tone="warn" role="alert">
          No budget cycle covers today. Restart DailyPot to roll cycles forward.
        </Banner>
        {anchorOpen ? <BalanceDialog onClose={() => setAnchorOpen(false)} /> : null}
      </div>
    )
  }

  const dayNo = diffDays(current.startDate, today) + 1
  const len = cycleLength(current)
  const toPayday = diffDays(today, current.endDate) + 1
  const dateline = `${weekday} ${dateText} · DAY ${dayNo} OF ${len} · PAYDAY IN ${toPayday} ${toPayday === 1 ? 'DAY' : 'DAYS'}`
  const urgent = meta.readOnly || meta.restoredFromBackup

  return (
    <div className="page dashboard">
      <PageHead dateline={dateline} title={title} />

      <div className="bento">
        <Masthead onAnchor={() => setAnchorOpen(true)} />
        <NetWorthWidget onAnchor={() => setAnchorOpen(true)} />

        {urgent ? (
          <Widget span={12} index={1} variant="flat">
            <div className="stack">
              {meta.readOnly ? (
                <Banner tone="danger" role="alert">
                  Read-only: your data file was made by a newer version of DailyPot. Update the app to make changes.
                </Banner>
              ) : null}
              {meta.restoredFromBackup ? (
                <Banner tone="warn" role="status">
                  Your data file was damaged, so DailyPot restored the newest automatic backup. The damaged file was kept in your data folder.
                </Banner>
              ) : null}
            </div>
          </Widget>
        ) : null}

        <DayStripRibbon
          cycle={current}
          onChangeAllowance={() => setAllowanceOpen(true)}
          onEarlyStart={() => setEarlyOpen(true)}
          onAdd={prefill}
          onFocusQuickAdd={focusQuickAdd}
          go={go}
        />

        <TodayRing cycle={current} />
        <PotWidget cycle={current} figureRef={potRef} go={go} />
        <CycleFlow cycle={current} />

        <Widget span={12} index={6} variant="flat" className="command-bar" id="quick-add">
          <div ref={barRef} className="stack">
            <span className="eyebrow">Quick add</span>
            <TransactionForm key={qa.key} compact initialDate={qa.date ?? undefined} onSaved={onSaved} />
            {/* The live region is always mounted and only its content changes, so assistive tech reliably announces each save. */}
            <p className="receipt" role="status" aria-live="polite" aria-atomic="true">
              {receipt ? (
                <span key={receipt.id} className="receipt-body">
                  <span>
                    Saved <Money value={receipt.amount} /> · <span dir="auto">{receipt.category}</span> ·{' '}
                    {receipt.kind === 'daily' ? (
                      <>
                        pot after today <Money value={pot.projected} />
                      </>
                    ) : receipt.kind === 'nonDaily' ? (
                      'from your main balance'
                    ) : (
                      'added to your main balance'
                    )}
                  </span>
                  <button type="button" className="btn sm ghost" onClick={() => void undo()}>
                    Undo
                  </button>
                </span>
              ) : null}
            </p>
          </div>
        </Widget>

        <BillsLedger cycle={current} span={unlogged.length > 0 ? 8 : 12} onPay={setPay} onSkip={setSkip} go={go} justPaid={justPaid} onFlashEnd={() => setJustPaid(null)} />
        {unlogged.length > 0 ? <UnloggedDays onAdd={prefill} go={go} /> : null}

        <Rhythm cycle={current} />
        <GoalsWidget go={go} />
        <InvestmentsWidget go={go} />
        <WhereItWent cycle={current} go={go} />
        <Nudges cycle={current} onChangeAllowance={() => setAllowanceOpen(true)} />
      </div>

      {drop ? <span ref={dropRef} className="ink-drop" aria-hidden="true" style={{ transform: `translate(${drop.x}px, ${drop.y}px)` }} /> : null}

      {pay ? <PayDialog instance={pay.instance} onClose={() => setPay(null)} onSaved={() => setJustPaid(pay.instance.key)} /> : null}
      {skip ? <SkipDialog instance={skip.instance} onClose={() => setSkip(null)} /> : null}
      {allowanceOpen ? <AllowanceDialog cycle={current} onClose={() => setAllowanceOpen(false)} /> : null}
      {earlyOpen ? <EarlyStartDialog cycle={current} onClose={() => setEarlyOpen(false)} /> : null}
      {anchorOpen ? <BalanceDialog onClose={() => setAnchorOpen(false)} /> : null}
    </div>
  )
}
