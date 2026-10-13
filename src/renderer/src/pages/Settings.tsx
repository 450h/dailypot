/** F9 — Settings: general, categories, PIN, backups, data, about. */
import { useEffect, useState } from 'react'
import { addDays, formatDate } from '@shared/dates'
import { cycleEndFor } from '@shared/engine'
import type { BackupInfo } from '@shared/ipc'
import { CURRENCIES } from '@shared/money'
import type { Category } from '@shared/schema'
import { Confirm, Field, Modal } from '../components/ui'
import { newId, useReady } from '../state/app'

export function Settings(): React.JSX.Element {
  return (
    <div className="page">
      <h1>Settings</h1>
      <General />
      <Categories />
      <PinSettings />
      <DataSettings />
      <About />
    </div>
  )
}

function General(): React.JSX.Element {
  const { state, derived, run } = useReady()
  const s = state.settings
  const [payday, setPayday] = useState(String(s.payday))
  const p = Number(payday)
  const pOk = Number.isInteger(p) && p >= 1 && p <= 31
  const current = derived.current
  const next1Start = current ? addDays(current.endDate, 1) : derived.today
  const next1End = pOk ? cycleEndFor(next1Start, p) : null
  const next2End = pOk && next1End ? cycleEndFor(addDays(next1End, 1), p) : null

  return (
    <div className="card">
      <h2>General</h2>
      <div className="grid grid-3">
        <Field label="Currency" hint="Display only; amounts aren’t converted">
          <select className="input" value={s.currency} onChange={(e) => void run(window.dailypot.updateSettings({ currency: e.target.value as (typeof CURRENCIES)[number] }), 'Saved')}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Theme">
          <select className="input" value={s.theme} onChange={(e) => void run(window.dailypot.updateSettings({ theme: e.target.value as typeof s.theme }))}>
            <option value="system">Match Windows</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
        <Field label="Payday (day of month)" error={payday && !pOk ? '1 to 31' : null}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input num" inputMode="numeric" value={payday} onChange={(e) => setPayday(e.target.value)} />
            <button className="btn" disabled={!pOk || p === s.payday} onClick={() => void run(window.dailypot.updateSettings({ payday: p }), 'Payday saved')}>
              Save
            </button>
          </div>
        </Field>
      </div>
      {pOk && p !== s.payday && next1End && next2End ? (
        <div className="banner info">
          The current cycle keeps its dates. Next cycles: {formatDate(next1Start)} – {formatDate(next1End)}, then {formatDate(addDays(next1End, 1))} – {formatDate(next2End)}.
        </div>
      ) : null}
    </div>
  )
}

function Categories(): React.JSX.Element {
  const { state, run } = useReady()
  const [editing, setEditing] = useState<Category | 'expense' | 'income' | null>(null)
  const list = (kind: Category['kind']): React.JSX.Element => (
    <div className="stack" style={{ gap: 0 }}>
      <div className="row-between">
        <h3>{kind === 'expense' ? 'Expense categories' : 'Income categories'}</h3>
        <button className="btn sm" onClick={() => setEditing(kind)}>
          Add
        </button>
      </div>
      <div className="list">
        {state.categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <div className="list-item" key={c.id}>
              <span className="dot" style={{ background: c.color }} aria-hidden />
              <span style={{ flex: 1 }} className={c.archived ? 'faint' : ''}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
              </span>
              <button className="btn sm ghost" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button className="btn sm ghost" onClick={() => void run(window.dailypot.upsert('categories', { ...c, archived: !c.archived }))}>
                {c.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          ))}
      </div>
    </div>
  )
  return (
    <div className="card">
      <h2>Categories</h2>
      <div className="grid grid-2">
        {list('expense')}
        {list('income')}
      </div>
      {editing ? <CategoryForm target={editing} onClose={() => setEditing(null)} /> : null}
    </div>
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
        <Field label="Colour">
          <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 2 }} />
        </Field>
      </div>
    </Modal>
  )
}

function PinSettings(): React.JSX.Element {
  const { state, meta, run, refresh } = useReady()
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
    <div className="card">
      <h2>PIN lock</h2>
      <p className="muted">
        {meta.pinSet ? 'A PIN is set.' : 'No PIN set.'} The PIN locks the screen only — it doesn’t encrypt your data file. If you forget it, delete <code>security.json</code> in
        your data folder.
      </p>
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
            <Field label="Auto-lock when idle">
              <select
                className="input"
                value={state.settings.autoLockMinutes}
                onChange={(e) => void run(window.dailypot.updateSettings({ autoLockMinutes: Number(e.target.value) }), 'Saved')}
              >
                <option value={0}>Off</option>
                {[1, 5, 10, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    After {m} min
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
      </div>
      {meta.pinSet ? <p className="faint">DailyPot also locks when you lock Windows.</p> : null}

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
    </div>
  )
}

function DataSettings(): React.JSX.Element {
  const { state, run, toast } = useReady()
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restore, setRestore] = useState<string | null>(null)
  useEffect(() => {
    void window.dailypot.backupList().then((r) => (r.ok ? setBackups(r.data) : setError(r.message)))
  }, [state])

  return (
    <div className="card">
      <h2>Backups & data</h2>
      <p className="muted">
        DailyPot keeps a snapshot of your data each day (last 14) on this PC. Export a copy to OneDrive or a USB drive now and then.
        {state.settings.lastExportAt ? ` Last export: ${formatDate(state.settings.lastExportAt.slice(0, 10), true)}.` : ' You haven’t exported yet.'}
      </p>
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
        <button className="btn ghost" onClick={() => void run(window.dailypot.backupOpenFolder())}>
          Open backups folder
        </button>
      </div>
      <h3>Automatic backups</h3>
      {error ? (
        <p className="err">{error}</p>
      ) : backups === null ? (
        <p className="faint">Loading…</p>
      ) : backups.length === 0 ? (
        <p className="faint">No backups yet — the first is made with your first change each day.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="table">
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td>
                    <code>{b.name}</code>
                  </td>
                  <td className="faint">{new Date(b.modified).toLocaleString()}</td>
                  <td className="faint r">{Math.max(1, Math.round(b.size / 1024))} KB</td>
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
      {restore ? (
        <Confirm
          title="Restore this backup?"
          message={`DailyPot will check ${restore} and ask you once more before replacing your current data. A backup of the current data is written first.`}
          confirmLabel="Continue"
          onConfirm={() => void run(window.dailypot.backupRestore(restore)).then((r) => r && toast('Backup restored'))}
          onClose={() => setRestore(null)}
        />
      ) : null}
    </div>
  )
}

function About(): React.JSX.Element {
  const { meta, run } = useReady()
  return (
    <div className="card">
      <h2>About</h2>
      <p className="muted">
        DailyPot v{meta.version} · MIT License · fully offline — no account, no cloud, no telemetry.
      </p>
      <p className="faint">
        Data folder: <code>{meta.dataPath}</code>
      </p>
      <div>
        <button className="btn" onClick={() => void run(window.dailypot.openRepo())}>
          Project page on GitHub
        </button>
      </div>
    </div>
  )
}
