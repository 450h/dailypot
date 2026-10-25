/**
 * F1 — first-run setup wizard (docs/09 §8 "Setup wizard"): a full-bleed DailyPot masthead, four ink step
 * segments, one paper card per step and a Day Strip preview of the first cycle with its budget and bills due.
 * Labels, placeholders and button names are kept exactly (e2e). New on step 1: an optional main balance that
 * becomes the balance anchor (anchorForBalanceNow) right after setup completes.
 */
import { useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { dateRange, diffDays, formatDate, todayLocal, weekdayShort } from '@shared/dates'
import { allInstances, anchorForBalanceNow, cycleEndFor, cycleLength, defaultStartMonth, validateFirstCycleStart } from '@shared/engine'
import { CURRENCIES, parseMoney } from '@shared/money'
import { Count, Field, IconButton, MoneyInput, Seg, useMoneyField, type CSSVars } from '../components/ui'
import { DayStrip, type StripDay } from '../components/viz'
import { useApp } from '../state/app'

interface DraftBill {
  key: number
  name: string
  amount: string
  dueDay: string
}

const STEPS = ['Basics', 'Per-day', 'Bills', 'PIN'] as const
/** Above this many days the strip cells would fall under 6px, so the preview shows words only. */
const MAX_STRIP_DAYS = 62

/** One bill row. The first row carries the visible eyebrow labels; later rows label their inputs for assistive tech only. */
function BillField({ label, first, children }: { label: string; first: boolean; children: ReactNode }): React.JSX.Element {
  if (first) return <Field label={label}>{children}</Field>
  return (
    <label className="field">
      <span className="sr-only">{label}</span>
      {children}
    </label>
  )
}

export function Setup(): React.JSX.Element {
  const { run, payload } = useApp()
  const today = payload?.meta.today ?? todayLocal()
  const [step, setStep] = useState(0)
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('SAR')
  const [payday, setPayday] = useState('')
  const allowance = useMoneyField(7000)
  const [start, setStart] = useState(today)
  const balance = useMoneyField()
  const [balanceSign, setBalanceSign] = useState<'credit' | 'overdrawn'>('credit')
  const [bills, setBills] = useState<DraftBill[]>([{ key: 1, name: '', amount: '', dueDay: '' }])
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)

  const paydayNum = Number(payday)
  const paydayOk = Number.isInteger(paydayNum) && paydayNum >= 1 && paydayNum <= 31
  const startErr = validateFirstCycleStart(start, today)
  const backdays = startErr ? 0 : diffDays(start, today)

  const parsedBills = bills
    .filter((b) => b.name.trim() || b.amount.trim() || b.dueDay.trim())
    .map((b) => ({ b, amount: parseMoney(b.amount), dueDay: Number(b.dueDay) }))
  const billErrors = parsedBills.some((x) => !x.b.name.trim() || !x.amount || !Number.isInteger(x.dueDay) || x.dueDay < 1 || x.dueDay > 31)
  const pinErr = pin === '' && pin2 === '' ? null : !/^\d{4,8}$/.test(pin) ? 'PIN must be 4–8 digits' : pin !== pin2 ? 'PINs don’t match' : null

  // Plan preview (docs/06 F1): the first cycle's dates, its budget and the bills due inside it. Cheap enough to derive each render.
  const preview = (() => {
    if (!paydayOk || startErr || allowance.value === null) return null
    const end = cycleEndFor(start, paydayNum)
    const days = cycleLength({ id: '', startDate: start, endDate: end, dailyAllowance: 0 })
    const obligations = parsedBills
      .filter((x) => x.amount && x.dueDay >= 1 && x.dueDay <= 31)
      .map((x, i) => ({ id: String(i), name: x.b.name, amount: x.amount!, dueDay: x.dueDay, startMonth: defaultStartMonth(x.dueDay, start) }))
    const due = allInstances(obligations, start, end).reduce((s, i) => s + i.plannedAmount, 0)
    return { end, days, budget: allowance.value * days, due }
  })()

  const stripDays: StripDay[] | null =
    preview && preview.days <= MAX_STRIP_DAYS
      ? dateRange(start, preview.end).map((date) => ({
          date,
          state: date < today ? 'unlogged' : date === today ? 'today' : 'future',
          label: `${weekdayShort(date)} ${formatDate(date)}, ${date < today ? 'before you started: unlogged until you add entries' : date === today ? 'today' : 'upcoming'}`
        }))
      : null

  const canNext = [paydayOk && !startErr && !balance.invalid, allowance.value !== null, !billErrors, !pinErr][step]
  const currentStep = STEPS[step] ?? STEPS[0]

  const finish = async (): Promise<void> => {
    if (allowance.value === null) return
    setBusy(true)
    const result = await run(
      window.dailypot.completeSetup({
        currency,
        payday: paydayNum,
        dailyAllowance: allowance.value,
        firstCycleStart: start,
        obligations: parsedBills.map((x) => ({ name: x.b.name.trim(), amount: x.amount!, dueDay: x.dueDay })),
        ...(pin ? { pin } : {})
      }),
      'You’re all set'
    )
    if (result && balance.value !== null) {
      const amount = balanceSign === 'overdrawn' && balance.value > 0 ? -balance.value : balance.value
      // "My balance today is X": the engine backs out today's flows so the derived balance equals X (docs/05 §10).
      await run(window.dailypot.updateSettings({ balanceAnchor: anchorForBalanceNow(result.state, result.meta.today, amount) }))
    }
    setBusy(false)
  }

  const updateBill = (key: number, patch: Partial<DraftBill>): void => setBills(bills.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  return (
    <div className="center-screen">
      <div className="panel" style={{ width: 'min(720px, 100%)' }}>
        {/* Full-bleed masthead: the wordmark at 48px display on a 2px rule, the step as a mono dateline. */}
        <header className="row-between" style={{ alignItems: 'flex-end', borderTop: 'var(--rule)', borderBottom: '1px solid var(--border)', padding: '14px 0' }}>
          <div className="brand" style={{ padding: 0, fontSize: 48, lineHeight: 1, gap: 14 }}>
            <span className="brand-mark" aria-hidden="true" style={{ width: 40, height: 40 }} />
            <span className="brand-text">DailyPot</span>
          </div>
          <p className="dateline">
            Step {step + 1} of {STEPS.length} · {currentStep}
          </p>
        </header>

        <div className="stack" style={{ gap: 6 }}>
          <h1>Welcome to DailyPot</h1>
          <p className="muted">Set a per-day allowance. What you don’t spend goes into a pot that pays your monthly bills.</p>
        </div>

        {/* Four ink segments: done = ink, current = accent, ahead = paper. The dateline above carries the words. */}
        <div className="steps" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div key={s} className={i <= step ? 'on' : ''} style={i < step ? { background: 'var(--ink)', boxShadow: 'none' } : undefined} />
          ))}
        </div>

        <div className="card">
          {step === 0 && (
            <>
              <div className="card-title">
                <div>
                  <h2>Basics</h2>
                  <p className="faint">Your currency, payday and the first tracked day.</p>
                </div>
              </div>
              <div className="grid grid-2">
                <Field label="Currency">
                  <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Payday (day of month)" error={payday && !paydayOk ? 'Enter a day from 1 to 31' : null} hint="The day your salary arrives, e.g. 27">
                  <input className="input num" inputMode="numeric" value={payday} placeholder="27" onChange={(e) => setPayday(e.target.value)} autoFocus aria-invalid={Boolean(payday) && !paydayOk} />
                </Field>
              </div>
              <Field
                label="Start tracking from"
                error={startErr}
                hint={backdays > 0 ? `⚠ ${backdays} past day(s) with no entries will each add your full per-day to the pot. Backfill them or start today.` : 'Usually today'}
              >
                <input className="input" type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MoneyInput field={balance} label="Main balance today (optional)" allowZero />
                </div>
                <Seg
                  label="Balance sign"
                  options={[
                    { value: 'credit', label: 'In credit' },
                    { value: 'overdrawn', label: 'Overdrawn' }
                  ]}
                  value={balanceSign}
                  onChange={setBalanceSign}
                />
              </div>
              <p className="faint">
                The cash in your main account right now, from your bank app. DailyPot derives your balance from here on; leave it empty to set it later under Settings.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <div className="card-title">
                <div>
                  <h2>Your per-day allowance</h2>
                  <p className="faint">How much you allow yourself to spend each day on daily life. Unspent money goes to the pot.</p>
                </div>
              </div>
              <MoneyInput field={allowance} label={`Per-day (${currency})`} autoFocus allowZero />
            </>
          )}

          {step === 2 && (
            <>
              <div className="card-title">
                <div>
                  <h2>Monthly bills the pot should pay</h2>
                  <p className="faint">Phone, gym, subscriptions… You can add more later.</p>
                </div>
              </div>
              {bills.map((b, i) => (
                <div key={b.key} className="row row-anim" style={{ alignItems: 'flex-end', flexWrap: 'nowrap', '--t0': '0ms', '--j': i } as CSSVars}>
                  <BillField label="Name" first={i === 0}>
                    <input className="input" dir="auto" maxLength={40} value={b.name} placeholder="Phone" onChange={(e) => updateBill(b.key, { name: e.target.value })} />
                  </BillField>
                  <BillField label="Amount" first={i === 0}>
                    <input className="input num" inputMode="decimal" value={b.amount} placeholder="80" onChange={(e) => updateBill(b.key, { amount: e.target.value })} />
                  </BillField>
                  <BillField label="Due day" first={i === 0}>
                    <input className="input num" inputMode="numeric" value={b.dueDay} placeholder="5" style={{ width: 80 }} onChange={(e) => updateBill(b.key, { dueDay: e.target.value })} />
                  </BillField>
                  <IconButton label="Remove bill" onClick={() => setBills(bills.filter((x) => x.key !== b.key))}>
                    <Trash2 size={16} aria-hidden />
                  </IconButton>
                </div>
              ))}
              {billErrors ? <em className="err">Each bill needs a name, an amount and a due day (1–31).</em> : null}
              <div>
                <button className="btn" onClick={() => setBills([...bills, { key: Date.now(), name: '', amount: '', dueDay: '' }])}>
                  <Plus size={16} aria-hidden /> Add bill
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="card-title">
                <div>
                  <h2>PIN lock (optional)</h2>
                  <p className="faint">A privacy screen, not encryption.</p>
                </div>
              </div>
              <p className="muted">
                Locks the app screen when you open it. It does <strong>not</strong> encrypt your data file, and there is no recovery if you forget it (deleting security.json removes it). 6+
                digits recommended.
              </p>
              <div className="grid grid-2">
                <Field label="PIN">
                  <input className="input pin-input" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                </Field>
                <Field label="Repeat PIN" error={pinErr}>
                  <input className="input pin-input" type="password" inputMode="numeric" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
                </Field>
              </div>
            </>
          )}

          <div className="row-between">
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Next
              </button>
            ) : (
              <button className="btn primary" disabled={!canNext || busy} onClick={() => void finish()}>
                Start using DailyPot
              </button>
            )}
          </div>
        </div>

        {preview ? (
          <div className="card" aria-live="polite">
            <div className="card-title">
              <div>
                <span className="eyebrow">First cycle</span>
                <h2>
                  {formatDate(start, true)} → {formatDate(preview.end, true)} · {preview.days} days
                </h2>
              </div>
            </div>
            {stripDays ? (
              <div inert>
                <DayStrip days={stripDays} legend={false} cell={14} delay={0} label="First cycle preview" />
              </div>
            ) : null}
            <p className="faint">
              {backdays > 0 ? `${backdays} back-filled day(s) (dotted) count as unlogged until you add entries · ` : ''}
              {stripDays ? 'outlined cell = today · grey = ahead' : 'Too many days to draw; the figures below still apply.'}
            </p>
            <div className="tiles">
              <div className="tile">
                <span className="eyebrow">Cycle budget</span>
                <span className="tile-hero">
                  <Count value={preview.budget} currency={currency} id="setup-budget" duration={700} />
                </span>
              </div>
              <div className="tile">
                <span className="eyebrow">Bills due this cycle</span>
                <span className="tile-hero">
                  <Count value={preview.due} currency={currency} id="setup-due" duration={700} />
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
