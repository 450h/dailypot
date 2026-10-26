/**
 * F9 — Settings (docs/09 §8 "Settings"): one long editorial form. Each section is an eyebrow on a 2px rule
 * with a two-column body (240px label + 12px help on the left, controls on the right). Sections: General,
 * Balance (anchor, docs/05 §10), Budget cycles (table + extend back), Categories, PIN lock, Backups & data, About.
 * All logic is unchanged: every write goes through window.dailypot.* via run().
 */
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { addDays, formatDate } from '@shared/dates'
import { cycleEndFor, cycleLength } from '@shared/engine'
import type { BackupInfo } from '@shared/ipc'
import { CURRENCIES } from '@shared/money'
import type { Category } from '@shared/schema'
import { BalanceDialog } from '../components/BalanceDialog'
import { ExtendBackDialog } from '../components/ExtendBackDialog'
import { Banner, Chip, Cols, Confirm, Count, Field, FoldLine, Modal, Money, PageHead, UserText, type CSSVars } from '../components/ui'
import { newId, useReady } from '../state/app'
import '../styles/pages/settings.css'

/* ------------------------------------------------------------------------------------------------
   Editorial form atoms (page-local)
   ------------------------------------------------------------------------------------------------ */

/** Section: eyebrow + 20px display title on the 2px rule, rows below. Rises in at 150ms + index × 40ms. */
function Section({ eyebrow, title, index, actions, children }: { eyebrow: string; title: string; index: number; actions?: ReactNode; children: ReactNode }): React.JSX.Element {
  const id = useId()
  return (
    <section className="settings-section row-anim" style={{ '--t0': '150ms', '--j': index } as CSSVars} aria-labelledby={id}>
      <div className="section-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        {actions ? (
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            {actions}
          </span>
        ) : null}
      </div>
      <div className="settings-body">{children}</div>
    </section>
  )
}

/** Two-column row. `htmlFor` makes the label text the control's real label (the help stays out of its name). */
function Row({ label, help, htmlFor, index, children }: { label: string; help?: ReactNode; htmlFor?: string; index: number; children: ReactNode }): React.JSX.Element {
  const style = { '--t0': '260ms', '--j': index } as CSSVars
  return (
    <div className="settings-row row-anim" style={style}>
      <div className="settings-label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {help ? <span className="settings-help">{help}</span> : null}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  )
}

export function Settings(): React.JSX.Element {
  const { meta } = useReady()
  return (
    <div className="page settings">
      <PageHead dateline={`DailyPot v${meta.version} · offline · local JSON`} title="Settings" />
      <General index={0} />
      <BalanceSection index={1} />
      <CyclesSection index={2} />
      <Categories index={3} />
      <PinSettings index={4} />
      <DataSettings index={5} />
      <About index={6} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
   General
   ------------------------------------------------------------------------------------------------ */

const THEMES = [
  { value: 'system', label: 'Match Windows' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
] as const
type Theme = (typeof THEMES)[number]['value']

/** Three labelled swatches in a radiogroup: roving tabindex, arrows move and select, ✓ glyph + word carry the state. */
function ThemeRadio({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }): React.JSX.Element {
  const target = (key: string, i: number): number | null => {
    const n = THEMES.length
    if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + n) % n
    if (key === 'Home') return 0
    if (key === 'End') return n - 1
    return null
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    const next = target(e.key, i)
    if (next === null) return
    e.preventDefault()
    const t = THEMES[next]
    if (!t) return
    onChange(t.value)
    const el = e.currentTarget.parentElement?.children[next]
    if (el instanceof HTMLElement) el.focus()
  }
  return (
    <div className="theme-radio" role="radiogroup" aria-label="Theme">
      {THEMES.map((t, i) => {
        const on = t.value === value
        return (
          <button key={t.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className="theme-swatch" onClick={() => onChange(t.value)} onKeyDown={(e) => onKey(e, i)}>
            <span className={`theme-chip ${t.value}`} aria-hidden="true">
              {on ? <span className="glyph">✓</span> : null}
            </span>
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function General({ index }: { index: number }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const s = state.settings
  const currencyId = useId()
  const paydayId = useId()
  const [payday, setPayday] = useState(String(s.payday))
  const p = Number(payday)
  const pOk = Number.isInteger(p) && p >= 1 && p <= 31
  const { current, today } = derived
  const next1Start = current ? addDays(current.endDate, 1) : today
  const next1End = pOk ? cycleEndFor(next1Start, p) : null
  const next2End = pOk && next1End ? cycleEndFor(addDays(next1End, 1), p) : null

  return (
    <Section eyebrow="Display & cycle" title="General" index={index}>
      <Row label="Currency" help="Display only; amounts aren’t converted." htmlFor={currencyId} index={0}>
        <select id={currencyId} className="input narrow" value={s.currency} onChange={(e) => void run(window.dailypot.updateSettings({ currency: e.target.value as (typeof CURRENCIES)[number] }), 'Saved')}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Row>
      <Row label="Theme" help="Match Windows follows your system setting and changes with it." index={1}>
        <ThemeRadio value={s.theme} onChange={(theme) => void run(window.dailypot.updateSettings({ theme }))} />
      </Row>
      <Row label="Payday (day of month)" help="The day your salary arrives, 1 to 31. The current cycle keeps its dates; later cycles follow the new payday." htmlFor={paydayId} index={2}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id={paydayId} className="input num narrow" inputMode="numeric" value={payday} onChange={(e) => setPayday(e.target.value)} aria-invalid={Boolean(payday) && !pOk} style={{ maxWidth: 120 }} />
          <button className="btn" disabled={!pOk || p === s.payday} onClick={() => void run(window.dailypot.updateSettings({ payday: p }), 'Payday saved')}>
            Save
          </button>
        </div>
        {payday && !pOk ? <em className="err">Enter a day from 1 to 31</em> : null}
        {pOk && p !== s.payday && next1End && next2End ? (
          <Banner tone="info" role="status">
            Next cycles: {formatDate(next1Start)} – {formatDate(next1End)}, then {formatDate(addDays(next1End, 1))} – {formatDate(next2End)}.
          </Banner>
        ) : null}
      </Row>
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------------
   Balance (docs/05 §10, ADR-0007)
   ------------------------------------------------------------------------------------------------ */

function BalanceSection({ index }: { index: number }): React.JSX.Element {
  const { state, derived, run } = useReady()
  const { balance, currency } = derived
  const anchor = state.settings.balanceAnchor
  const [dialog, setDialog] = useState(false)
  const [clearing, setClearing] = useState(false)

  return (
    <Section eyebrow="Main balance anchor" title="Balance" index={index}>
      <Row label="Anchor" help="One figure from your bank app. Everything after it is recalculated from your history, never stored." index={0}>
        <div className="row">
          {anchor ? (
            <Chip tone="ok" glyph="✓">
              Anchored
            </Chip>
          ) : (
            <Chip tone="warn" glyph="?">
              Not set
            </Chip>
          )}
          {anchor ? (
            <span>
              At the start of {formatDate(anchor.date, true)} your main balance was <Money value={anchor.amount} currency={currency} />.
            </span>
          ) : (
            <span>
              The dashboard shows the change since {balance.since ? formatDate(balance.since, true) : 'tracking began'}, not a bank balance.
            </span>
          )}
        </div>
        <p className="muted">
          Balance today:{' '}
          <span className="num" style={{ fontWeight: 600 }}>
            <Count value={balance.balance} currency={currency} id="settings-balance" delay={300} />
          </span>
          {anchor ? ' · recalculated from the anchor and every cash flow since.' : ' · the net of income, spending, bills, savings and investments so far.'}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => setDialog(true)}>
            {anchor ? 'Update balance' : 'Set balance'}
          </button>
          {anchor ? (
            <button className="btn" onClick={() => setClearing(true)}>
              Clear anchor
            </button>
          ) : null}
        </div>
      </Row>
      <Row label="Why it can drift" help="Cash movements DailyPot doesn’t track." index={1}>
        <p className="muted">
          Cash movements DailyPot doesn’t model (transfers, refunds, fees) make the derived figure drift from your real account. The remedy is re-anchoring — “my balance now is X” —
          never editing history. The pot is an earmark inside the main balance, so it is never subtracted; a bill’s “from main” share is informational.
        </p>
      </Row>
      {dialog ? <BalanceDialog onClose={() => setDialog(false)} /> : null}
      {clearing ? (
        <Confirm
          title="Clear the balance anchor?"
          message="The main balance goes back to showing the change since your first cycle started. Nothing else changes; you can set a new anchor at any time."
          confirmLabel="Clear anchor"
          onConfirm={() => void run(window.dailypot.updateSettings({ balanceAnchor: null }), 'Anchor cleared')}
          onClose={() => setClearing(false)}
        />
      ) : null}
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------------
   Budget cycles (docs/05 §3)
   ------------------------------------------------------------------------------------------------ */

function CyclesSection({ index }: { index: number }): React.JSX.Element {
  const { derived } = useReady()
  const { cycles, pot, currency, current, today } = derived
  const [extend, setExtend] = useState(false)
  const newestFirst = [...cycles].reverse()

  return (
    <Section
      eyebrow="Payday to payday"
      title="Budget cycles"
      index={index}
      actions={
        <button className="btn" onClick={() => setExtend(true)} disabled={cycles.length === 0}>
          Extend tracking back…
        </button>
      }
    >
      <Row label="All cycles" help="Newest first. Closed cycles can’t be edited; to add earlier history, extend tracking back and the pot timeline starts from the new first day." index={0}>
        {newestFirst.length === 0 ? (
          <p className="muted">No budget cycle yet.</p>
        ) : (
          <div className="table-wrap scroll">
            <table className="table">
              {/* Folding ledger (docs/09 §4.12): the pot columns fold under the start date at 620px (the control column is 584px at a 1200px window). */}
              <Cols cols={['auto', 104, 64, 'num', ['num', 2], ['num', 2]]} />
              <thead>
                <tr>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col" className="r">Days</th>
                  <th scope="col" className="r">Per-day</th>
                  <th scope="col" className="r" data-fold="2">
                    Opening pot
                  </th>
                  <th scope="col" className="r" data-fold="2">
                    Closing pot
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((c, i) => {
                  const opening = pot.cycleOpening.get(c.id)
                  const closing = pot.cycleClosing.get(c.id)
                  const isCurrent = current?.id === c.id
                  const future = c.startDate > today
                  return (
                    <tr key={c.id} className="row-anim" style={{ '--t0': '360ms', '--j': i } as CSSVars}>
                      <td className="mono">
                        <span className="row" style={{ gap: 8 }}>
                          {formatDate(c.startDate, true)}
                          {isCurrent ? (
                            <Chip tone="accent" glyph="●">
                              Current
                            </Chip>
                          ) : future ? (
                            <Chip tone="info" glyph="→">
                              Upcoming
                            </Chip>
                          ) : null}
                        </span>
                        <FoldLine level={2}>opening {opening === undefined ? '—' : <Money value={opening} />}</FoldLine>
                        <FoldLine level={2}>closing {closing === undefined || closing === null ? (isCurrent || future ? 'open' : '—') : <Money value={closing} />}</FoldLine>
                      </td>
                      <td className="mono">{formatDate(c.endDate, true)}</td>
                      <td className="r mono num">{cycleLength(c)}</td>
                      <td className="r mono">
                        <Money value={c.dailyAllowance} />
                      </td>
                      <td className="r mono" data-fold="2">
                        {opening === undefined ? <span className="faint">—</span> : <Count value={opening} id={`cycle-open-${c.id}`} delay={420 + i * 30} duration={700} />}
                      </td>
                      <td className="r mono" data-fold="2">
                        {closing === undefined || closing === null ? (
                          <span className="faint">{isCurrent || future ? 'open' : '—'}</span>
                        ) : (
                          <Count value={closing} id={`cycle-close-${c.id}`} delay={420 + i * 30} duration={700} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {newestFirst.length > 0 ? <p className="faint">All amounts in {currency}.</p> : null}
      </Row>
      {extend ? <ExtendBackDialog onClose={() => setExtend(false)} /> : null}
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------------
   Categories
   ------------------------------------------------------------------------------------------------ */

function Categories({ index }: { index: number }): React.JSX.Element {
  const { state, run } = useReady()
  const [editing, setEditing] = useState<Category | 'expense' | 'income' | null>(null)
  const list = (kind: Category['kind']): React.JSX.Element => {
    const items = state.categories.filter((c) => c.kind === kind)
    return (
      <>
        {items.length === 0 ? <p className="muted">None yet.</p> : null}
        <div className="list">
          {items.map((c, i) => (
            <div className="list-item row-anim" key={c.id} style={{ '--t0': '420ms', '--j': i } as CSSVars}>
              <span className="dot" style={{ background: c.color }} aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }} className={c.archived ? 'faint' : ''}>
                <UserText>{c.name}</UserText>
              </span>
              {c.archived ? (
                <Chip tone="neutral" glyph="–">
                  Archived
                </Chip>
              ) : null}
              <button className="btn sm ghost" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button className="btn sm ghost" onClick={() => void run(window.dailypot.upsert('categories', { ...c, archived: !c.archived }))}>
                {c.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          ))}
        </div>
        <div>
          <button className="btn sm" onClick={() => setEditing(kind)}>
            Add {kind === 'expense' ? 'expense' : 'income'} category
          </button>
        </div>
      </>
    )
  }
  return (
    <Section eyebrow="Expense & income" title="Categories" index={index}>
      <Row label="Expense categories" help="Archived categories stay on old entries but leave the pickers." index={0}>
        {list('expense')}
      </Row>
      <Row label="Income categories" index={1}>
        {list('income')}
      </Row>
      {editing ? <CategoryForm target={editing} onClose={() => setEditing(null)} /> : null}
    </Section>
  )
}

function CategoryForm({ target, onClose }: { target: Category | 'expense' | 'income'; onClose: () => void }): React.JSX.Element {
  const { run } = useReady()
  const existing = typeof target === 'string' ? undefined : target
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? '#5b8def')
  const save = async (): Promise<void> => {
    const ok = await run(
      window.dailypot.upsert('categories', {
        id: existing?.id ?? newId(),
        name: name.trim(),
        kind: existing?.kind ?? (target as Category['kind']),
        color,
        archived: existing?.archived ?? false
      }),
      'Category saved'
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={existing ? 'Edit category' : 'New category'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label="Name">
          <input className="input" dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Colour" hint="Shown as a 10px dot with an ink ring">
          <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 2 }} />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------------------------------------
   PIN lock
   ------------------------------------------------------------------------------------------------ */

function PinSettings({ index }: { index: number }): React.JSX.Element {
  const { state, meta, run, refresh } = useReady()
  const autoLockId = useId()
  const [mode, setMode] = useState<'set' | 'clear' | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const close = (): void => {
    setMode(null)
    setCurrent('')
    setNext('')
    setNext2('')
  }
  const nextErr = next && !/^\d{4,8}$/.test(next) ? '4–8 digits' : next2 && next !== next2 ? 'PINs don’t match' : null
  const digits = (v: string): string => v.replace(/\D/g, '')

  return (
    <Section eyebrow="Privacy screen" title="PIN lock" index={index}>
      <Row
        label="Status"
        help={
          <>
            The PIN locks the screen only — it doesn’t encrypt your data file. If you forget it, delete <code>security.json</code> in your data folder.
          </>
        }
        index={0}
      >
        <div className="row">
          {meta.pinSet ? (
            <Chip tone="ok" glyph="✓">
              PIN set
            </Chip>
          ) : (
            <Chip tone="neutral" glyph="–">
              No PIN
            </Chip>
          )}
          {meta.pinSet ? <span className="faint">DailyPot also locks when you lock Windows.</span> : null}
        </div>
        <div className="row">
          <button className="btn" onClick={() => setMode('set')}>
            {meta.pinSet ? 'Change PIN' : 'Set a PIN'}
          </button>
          {meta.pinSet ? (
            <>
              <button className="btn" onClick={() => setMode('clear')}>
                Remove PIN
              </button>
              <button className="btn" onClick={() => void run(window.dailypot.pinLock()).then(refresh)}>
                Lock now
              </button>
            </>
          ) : null}
        </div>
      </Row>
      {meta.pinSet ? (
        <Row label="Auto-lock when idle" help="Idle time comes from Windows; the screen locks after this many minutes without input." htmlFor={autoLockId} index={1}>
          <select id={autoLockId} className="input narrow" value={state.settings.autoLockMinutes} onChange={(e) => void run(window.dailypot.updateSettings({ autoLockMinutes: Number(e.target.value) }), 'Saved')}>
            <option value={0}>Off</option>
            {[1, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                After {m} min
              </option>
            ))}
          </select>
        </Row>
      ) : null}

      {mode ? (
        <Modal
          title={mode === 'clear' ? 'Remove PIN' : meta.pinSet ? 'Change PIN' : 'Set a PIN'}
          onClose={close}
          actions={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={mode === 'clear' ? current.length < 4 : !!nextErr || !next || next !== next2 || (meta.pinSet && current.length < 4)}
                onClick={() =>
                  void run(
                    mode === 'clear' ? window.dailypot.pinClear(current) : window.dailypot.pinSet(meta.pinSet ? current : undefined, next),
                    mode === 'clear' ? 'PIN removed' : 'PIN saved'
                  ).then(async (ok) => {
                    if (ok) {
                      close()
                      await refresh()
                    }
                  })
                }
              >
                Save
              </button>
            </>
          }
        >
          {meta.pinSet ? (
            <Field label="Current PIN">
              <input className="input pin-input" type="password" inputMode="numeric" maxLength={8} value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
            </Field>
          ) : null}
          {mode === 'set' ? (
            <div className="grid grid-2">
              <Field label="New PIN" hint="6+ digits recommended">
                <input className="input pin-input" type="password" inputMode="numeric" maxLength={8} value={next} onChange={(e) => setNext(digits(e.target.value))} />
              </Field>
              <Field label="Repeat new PIN" error={nextErr}>
                <input className="input pin-input" type="password" inputMode="numeric" maxLength={8} value={next2} onChange={(e) => setNext2(digits(e.target.value))} />
              </Field>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------------
   Backups & data
   ------------------------------------------------------------------------------------------------ */

function DataSettings({ index }: { index: number }): React.JSX.Element {
  const { state, run, toast } = useReady()
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restore, setRestore] = useState<string | null>(null)
  useEffect(() => {
    void window.dailypot.backupList().then((r) => (r.ok ? setBackups(r.data) : setError(r.message)))
  }, [state])

  return (
    <Section eyebrow="Snapshots, export, import" title="Backups & data" index={index}>
      <Row
        label="Your copy"
        help={
          <>
            Automatic snapshots stay on this PC. Export a copy to OneDrive or a USB drive now and then.{' '}
            {state.settings.lastExportAt ? `Last export: ${formatDate(state.settings.lastExportAt.slice(0, 10), true)}.` : 'You haven’t exported yet.'}
          </>
        }
        index={0}
      >
        <div className="row">
          <button className="btn primary" onClick={() => void run(window.dailypot.dataExport()).then((r) => r && toast('Exported'))}>
            Export everything (JSON)
          </button>
          <button className="btn" onClick={() => void run(window.dailypot.dataImport(), 'Data imported')}>
            Import…
          </button>
          <button className="btn" onClick={() => void run(window.dailypot.dataExportCsv([])).then((ok) => ok && toast('CSV exported'))}>
            Export transactions (CSV)
          </button>
        </div>
      </Row>
      <Row label="Automatic backups" help="One snapshot per day with your first change, the last 14 kept. Restoring writes a pre-restore backup first." index={1}>
        {error ? (
          <p className="err">{error}</p>
        ) : backups === null ? (
          <p className="faint" aria-busy="true">
            Loading…
          </p>
        ) : backups.length === 0 ? (
          <p className="faint">No backups yet — the first is made with your first change each day.</p>
        ) : (
          <div className="table-wrap scroll">
            <table className="table backups-table">
              <Cols cols={['auto', [168, 2], 72, 'actions']} />
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col" data-fold="2">Saved</th>
                  <th scope="col" className="r">Size</th>
                  <th scope="col" className="r">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={b.name} className="row-anim" style={{ '--t0': '480ms', '--j': i } as CSSVars}>
                    <td className="mono">
                      {b.name}
                      <FoldLine level={2}>saved {new Date(b.modified).toLocaleString()}</FoldLine>
                    </td>
                    <td className="mono faint" data-fold="2">
                      {new Date(b.modified).toLocaleString()}
                    </td>
                    <td className="mono faint r">{Math.max(1, Math.round(b.size / 1024))} KB</td>
                    <td className="r">
                      <button className="btn sm" onClick={() => setRestore(b.name)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <button className="btn ghost" onClick={() => void run(window.dailypot.backupOpenFolder())}>
            Open backups folder
          </button>
        </div>
      </Row>
      {restore ? (
        <Confirm
          title="Restore this backup?"
          message={`DailyPot will check ${restore} and ask you once more before replacing your current data. A backup of the current data is written first.`}
          confirmLabel="Continue"
          onConfirm={() => void run(window.dailypot.backupRestore(restore)).then((r) => r && toast('Backup restored'))}
          onClose={() => setRestore(null)}
        />
      ) : null}
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------------
   About (colophon)
   ------------------------------------------------------------------------------------------------ */

function About({ index }: { index: number }): React.JSX.Element {
  const { meta, run } = useReady()
  return (
    <Section eyebrow="Colophon" title="About" index={index}>
      <Row label="DailyPot" help="A free, offline per-day budget with a bill-paying side pot." index={0}>
        <div className="colophon">
          <p className="mono">v{meta.version} · MIT License · fully offline — no account, no cloud, no telemetry</p>
          <p>
            Data folder: <code>{meta.dataPath}</code>
          </p>
          <p>Set in Segoe UI Variable and Cascadia Mono · ultramarine and burnt orange on warm paper · every figure derived from your history, nothing stored twice.</p>
          <div>
            <button className="btn" onClick={() => void run(window.dailypot.openRepo())}>
              Project page on GitHub
            </button>
          </div>
        </div>
      </Row>
    </Section>
  )
}
