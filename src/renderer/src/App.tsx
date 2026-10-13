import { useState } from 'react'
import { BarChart3, CircleDollarSign, Home, Landmark, ListOrdered, Lock, PiggyBank, Receipt, Settings as SettingsIcon, Target } from 'lucide-react'
import { Toasts } from './components/ui'
import { AppProvider, useApp } from './state/app'
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
  const { run, payload, refresh } = useApp()
  const [page, setPage] = useState<PageKey>('dashboard')
  const go = (p: PageKey): void => setPage(p)
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <CircleDollarSign size={18} />
          </div>
          DailyPot
        </div>
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} className="nav-btn" aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
        <div className="sidebar-foot">
          {payload?.meta.pinSet ? (
            <button className="nav-btn" onClick={() => void run(window.dailypot.pinLock()).then(refresh)}>
              <Lock size={17} aria-hidden /> Lock now
            </button>
          ) : null}
          <span className="faint" style={{ padding: '4px 10px' }}>
            v{payload?.meta.version}
          </span>
        </div>
      </nav>
      <main className="main">
        {page === 'dashboard' && <Dashboard go={go} />}
        {page === 'transactions' && <Transactions />}
        {page === 'bills' && <Bills />}
        {page === 'pot' && <PotHistory />}
        {page === 'goals' && <Goals />}
        {page === 'investments' && <Investments />}
        {page === 'reports' && <Reports />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  )
}

function Router(): React.JSX.Element {
  const { payload, loadError, refresh } = useApp()
  if (loadError)
    return (
      <div className="center-screen">
        <div className="panel card">
          <h1>DailyPot couldn’t load</h1>
          <p className="muted">{loadError}</p>
          <button className="btn primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    )
  if (!payload)
    return (
      <div className="center-screen" aria-busy="true">
        <p className="muted">Loading…</p>
      </div>
    )
  // Lock first: recovery actions are refused while locked (QA B13).
  if (payload.meta.locked) return <LockScreen />
  if (payload.meta.recoveryNeeded) return <Recovery />
  if (payload.meta.readOnly)
    return (
      <div className="center-screen">
        <div className="panel card">
          <h1>Update DailyPot to open your data</h1>
          <p className="muted">
            Your data file was saved by a newer version of DailyPot. It hasn’t been changed. Install the latest version from the project’s GitHub Releases page.
          </p>
          <p className="faint">
            Data folder: <code>{payload.meta.dataPath}</code>
          </p>
        </div>
      </div>
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
