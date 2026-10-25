/** App shell (docs/09 §5.1): brand, sidebar with sliding indicator and count badges, main, footer; routing screens. */
import { useMemo, useState } from 'react'
import { BarChart3, Home, Landmark, ListOrdered, Lock, PiggyBank, Receipt, Settings as SettingsIcon, Target } from 'lucide-react'
import type { ISODate } from '@shared/dates'
import { dashboardBills } from '@shared/engine'
import { Toasts } from './components/ui'
import { CountScope } from './hooks/useCountUp'
import { useVisit } from './hooks/useVisit'
import { AppProvider, BACKUP_NUDGE_DAYS, exportAgeDays, useApp, useReady } from './state/app'
import { Bills } from './pages/Bills'
import { Dashboard } from './pages/Dashboard'
import { Goals } from './pages/Goals'
import { Investments } from './pages/Investments'
import { LockScreen } from './pages/LockScreen'
import { PotHistory } from './pages/PotHistory'
import { Recovery } from './pages/Recovery'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Setup } from './pages/Setup'
import { Transactions } from './pages/Transactions'

export type PageKey = 'dashboard' | 'transactions' | 'bills' | 'pot' | 'goals' | 'investments' | 'reports' | 'settings'
/** Navigate; `date` (Pot history only) scrolls to and highlights that day's row on arrival. */
export type Go = (p: PageKey, opts?: { date?: ISODate }) => void

const NAV: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: 'dashboard', label: 'Dashboard', icon: Home },
  { key: 'transactions', label: 'Transactions', icon: ListOrdered },
  { key: 'bills', label: 'Bills', icon: Receipt },
  { key: 'pot', label: 'Pot history', icon: PiggyBank },
  { key: 'goals', label: 'Savings goals', icon: Target },
  { key: 'investments', label: 'Investments', icon: Landmark },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: SettingsIcon }
]

function Shell(): React.JSX.Element {
  const { run, state, derived, meta, refresh } = useReady()
  const [page, setPage] = useState<PageKey>('dashboard')
  const [potFocus, setPotFocus] = useState<ISODate | null>(null)
  const visit = useVisit(page === 'dashboard')
  const go: Go = (p, opts) => {
    setPotFocus(p === 'pot' ? (opts?.date ?? null) : null)
    setPage(p)
  }

  // Destructured first: `derived.current` is a cycle, not a ref, and the memo must track it as a value.
  const { current: cycle, pot, today } = derived
  const overdue = useMemo(() => (cycle ? dashboardBills(pot, cycle, today).filter((b) => b.status === 'overdue').length : 0), [cycle, pot, today])
  const badges: Partial<Record<PageKey, { count: number; what: string }>> = {
    pot: { count: derived.unlogged.length, what: derived.unlogged.length === 1 ? 'unlogged day' : 'unlogged days' },
    bills: { count: overdue, what: overdue === 1 ? 'overdue bill' : 'overdue bills' }
  }
  const navIndex = Math.max(0, NAV.findIndex((n) => n.key === page))

  const age = exportAgeDays(state.settings.lastExportAt, derived.today)
  const backupWarn = age === null || age >= BACKUP_NUDGE_DAYS
  const backupShort = age === null ? 'No backup yet' : age === 0 ? 'Backup today' : `Backup ${age}d ago`
  const backupTitle =
    age === null
      ? 'You have not exported a backup yet. Automatic backups live on this PC only; export a copy from Settings.'
      : `Last exported backup: ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}. Automatic backups live on this PC only; export a copy from Settings.`

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">DailyPot</span>
        </div>
        <div className="nav-list" style={{ '--nav-index': navIndex } as React.CSSProperties}>
          <span className="nav-indicator" aria-hidden="true" />
          {NAV.map(({ key, label, icon: Icon }) => {
            const badge = badges[key]
            const descId = badge && badge.count > 0 ? `nav-desc-${key}` : undefined
            return (
              <button key={key} className="nav-btn" title={label} aria-current={page === key ? 'page' : undefined} aria-describedby={descId} onClick={() => go(key)}>
                <Icon size={17} aria-hidden />
                <span className="nav-label">{label}</span>
                {badge && badge.count > 0 ? (
                  <span className="nav-badge" aria-hidden="true">
                    {badge.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {Object.entries(badges).map(([key, b]) =>
          b && b.count > 0 ? (
            <span key={key} id={`nav-desc-${key}`} className="sr-only">
              {b.count} {b.what}
            </span>
          ) : null
        )}
        <div className="sidebar-foot">
          {meta.pinSet ? (
            <button className="nav-btn" title="Lock now" onClick={() => void run(window.dailypot.pinLock()).then(refresh)}>
              <Lock size={17} aria-hidden />
              <span className="nav-label">Lock now</span>
            </button>
          ) : null}
          <div className="sidebar-meta" title={backupTitle}>
            <span className={`backup-dot ${backupWarn ? 'warn' : ''}`} aria-hidden="true" />
            <span className="meta-text">
              {backupShort} · v{meta.version}
            </span>
            <span className="sr-only">{backupTitle}</span>
          </div>
        </div>
      </nav>
      <main className="main">
        <CountScope key={`${page}:${visit}`}>
          {page === 'dashboard' && <Dashboard key={visit} go={go} />}
          {page === 'transactions' && <Transactions />}
          {page === 'bills' && <Bills />}
          {page === 'pot' && <PotHistory focusDate={potFocus} />}
          {page === 'goals' && <Goals />}
          {page === 'investments' && <Investments />}
          {page === 'reports' && <Reports />}
          {page === 'settings' && <Settings />}
        </CountScope>
      </main>
    </div>
  )
}

/** Full-screen notice with the rule header (docs/09 §8 "Recovery / load error / read-only"). */
function Notice({ eyebrow, title, children, busy }: { eyebrow: string; title?: string; children: React.ReactNode; busy?: boolean }): React.JSX.Element {
  return (
    <div className="center-screen" aria-busy={busy}>
      <div className="panel card">
        <div className="poster-head">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">DailyPot</span>
          </div>
          <p className="dateline">{eyebrow}</p>
          {title ? <h1>{title}</h1> : null}
        </div>
        {children}
      </div>
    </div>
  )
}

function Router(): React.JSX.Element {
  const { payload, loadError, refresh } = useApp()
  if (loadError)
    return (
      <Notice eyebrow="Could not open your data" title="DailyPot couldn’t load">
        <p className="muted">{loadError}</p>
        <div className="row">
          <button className="btn primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </Notice>
    )
  if (!payload)
    return (
      <Notice eyebrow="Reading your data" busy>
        <p className="muted">Loading…</p>
      </Notice>
    )
  // Lock first: recovery actions are refused while locked (QA B13).
  if (payload.meta.locked) return <LockScreen />
  if (payload.meta.recoveryNeeded) return <Recovery />
  if (payload.meta.readOnly)
    return (
      <Notice eyebrow="Read-only" title="Update DailyPot to open your data">
        <p className="muted">
          Your data file was saved by a newer version of DailyPot. It hasn’t been changed. Install the latest version from the project’s GitHub Releases page.
        </p>
        <p className="faint">
          Data folder: <code>{payload.meta.dataPath}</code>
        </p>
      </Notice>
    )
  if (!payload.state.settings.setupComplete) return <Setup />
  return <Shell />
}

export function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Router />
      <Toasts />
    </AppProvider>
  )
}
