/** Shown when data.json is corrupt and no snapshot is valid (docs/05 §9). Never a silent fresh start. */
import { useState } from 'react'
import { Confirm } from '../components/ui'
import { useApp } from '../state/app'

export function Recovery(): React.JSX.Element {
  const { run, payload } = useApp()
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="center-screen">
      <div className="panel card">
        <h1>Your data file couldn’t be read</h1>
        <p className="muted">
          DailyPot found a damaged data file and no valid automatic backup. The damaged file was kept as <code>data.corrupt-…json</code> in{' '}
          <code>{payload?.meta.dataPath}</code>.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => void run(window.dailypot.dataImport(), 'Data imported')}>
            Import a backup file…
          </button>
          <button className="btn danger" onClick={() => setConfirm(true)}>
            Start fresh
          </button>
        </div>
      </div>
      {confirm ? (
        <Confirm
          title="Start fresh?"
          message="You’ll go through setup again. The damaged file stays in your data folder."
          confirmLabel="Start fresh"
          danger
          onConfirm={() => void run(window.dailypot.recoveryStartFresh())}
          onClose={() => setConfirm(false)}
        />
      ) : null}
    </div>
  )
}
