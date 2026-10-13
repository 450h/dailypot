/** F1 — first-run setup wizard. */
import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { diffDays, formatDate, todayLocal } from '@shared/dates'
import { allInstances, cycleEndFor, cycleLength, defaultStartMonth, validateFirstCycleStart } from '@shared/engine'
import { CURRENCIES, formatMoney, parseMoney } from '@shared/money'
import { Field, MoneyInput, useMoneyField } from '../components/ui'
import { useApp } from '../state/app'

interface DraftBill {
  key: number
  name: string
  amount: string
  dueDay: string
}

const STEPS = ['Basics', 'Per-day', 'Bills', 'PIN'] as const

export function Setup(): React.JSX.Element {
  const { run, payload } = useApp()
  const today = payload?.meta.today ?? todayLocal()
  const [step, setStep] = useState(0)
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('SAR')
  const [payday, setPayday] = useState('')
  const allowance = useMoneyField(7000)
  const [start, setStart] = useState(today)
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
  const billErrors = parsedBills.some(
    (x) => !x.b.name.trim() || !x.amount || !Number.isInteger(x.dueDay) || x.dueDay < 1 || x.dueDay > 31
  )
  const pinErr = pin === '' && pin2 === '' ? null : !/^\d{4,8}$/.test(pin) ? 'PIN must be 4–8 digits' : pin !== pin2 ? 'PINs don’t match' : null

  const preview = useMemo(() => {
    if (!paydayOk || startErr || allowance.value === null) return null
    const end = cycleEndFor(start, paydayNum)
    const days = cycleLength({ id: '', startDate: start, endDate: end, dailyAllowance: 0 })
    const obligations = parsedBills
      .filter((x) => x.amount && x.dueDay >= 1 && x.dueDay <= 31)
      .map((x, i) => ({ id: String(i), name: x.b.name, amount: x.amount!, dueDay: x.dueDay, startMonth: defaultStartMonth(x.dueDay, start) }))
    const due = allInstances(obligations, start, end).reduce((s, i) => s + i.plannedAmount, 0)
    return { end, days, budget: allowance.value * days, due }
  }, [paydayOk, startErr, allowance.value, start, paydayNum, parsedBills])

  const canNext = [paydayOk && !startErr, allowance.value !== null, !billErrors, !pinErr][step]

  const finish = async (): Promise<void> => {
    if (allowance.value === null) return
    setBusy(true)
    await run(
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
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <div className="panel">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Welcome to DailyPot</h1>
          <p className="muted">Set a per-day allowance. What you don’t spend goes into a pot that pays your monthly bills.</p>
        </div>
        <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <div key={s} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        <div className="card">
          {step === 0 && (
            <>
              <h2>Basics</h2>
              <div className="grid grid-2">
                <Field label="Currency">
                  <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Payday (day of month)" error={payday && !paydayOk ? 'Enter a day from 1 to 31' : null} hint="The day your salary arrives, e.g. 27">
                  <input className="input num" inputMode="numeric" value={payday} placeholder="27" onChange={(e) => setPayday(e.target.value)} autoFocus />
                </Field>
              </div>
              <Field
                label="Start tracking from"
                error={startErr}
                hint={backdays > 0 ? `⚠ ${backdays} past day(s) with no entries will each add your full per-day to the pot. Backfill them or start today.` : 'Usually today'}
              >
                <input className="input" type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h2>Your per-day allowance</h2>
              <p className="muted">How much you allow yourself to spend each day on daily life. Unspent money goes to the pot.</p>
              <MoneyInput field={allowance} label={`Per-day (${currency})`} autoFocus allowZero />
            </>
          )}

          {step === 2 && (
            <>
              <h2>Monthly bills the pot should pay</h2>
              <p className="muted">Phone, gym, subscriptions… You can add more later.</p>
              {bills.map((b, i) => (
                <div key={b.key} className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                  <Field label={i === 0 ? 'Name' : ' '}>
                    <input className="input" dir="auto" maxLength={40} value={b.name} placeholder="Phone" onChange={(e) => setBills(bills.map((x) => (x.key === b.key ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Amount' : ' '}>
                    <input className="input num" inputMode="decimal" value={b.amount} placeholder="80" onChange={(e) => setBills(bills.map((x) => (x.key === b.key ? { ...x, amount: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Due day' : ' '}>
                    <input className="input num" inputMode="numeric" value={b.dueDay} placeholder="5" style={{ width: 80 }} onChange={(e) => setBills(bills.map((x) => (x.key === b.key ? { ...x, dueDay: e.target.value } : x)))} />
                  </Field>
                  <button className="btn ghost" aria-label="Remove bill" onClick={() => setBills(bills.filter((x) => x.key !== b.key))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {billErrors ? <em className="err">Each bill needs a name, an amount and a due day (1–31).</em> : null}
              <div>
                <button className="btn" onClick={() => setBills([...bills, { key: Date.now(), name: '', amount: '', dueDay: '' }])}>
                  <Plus size={16} /> Add bill
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>PIN lock (optional)</h2>
              <p className="muted">
                Locks the app screen when you open it. It does <strong>not</strong> encrypt your data file, and there is no recovery if you forget it (deleting security.json removes it).
                6+ digits recommended.
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

          {preview ? (
            <div className="banner info">
              <span>
                Cycle {formatDate(start)} → {formatDate(preview.end)} ({preview.days} days) · cycle budget{' '}
                <strong>{formatMoney(preview.budget, currency)}</strong> · bills due this cycle <strong>{formatMoney(preview.due, currency)}</strong>
              </span>
            </div>
          ) : null}

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
      </div>
    </div>
  )
}
