/** F10 — PIN lock screen. Backoff is enforced in main; this only displays it. */
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useApp } from '../state/app'

export function LockScreen(): React.JSX.Element {
  const { refresh } = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1000)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const submit = async (): Promise<void> => {
    const r = await window.dailypot.pinVerify(pin)
    setPin('')
    if (!r.ok) {
      setError(r.message)
      const s = await window.dailypot.pinStatus()
      if (s.ok) setWait(s.data.retryAfterMs)
      return
    }
    if (r.data.locked) {
      setError('Wrong PIN')
      setWait(r.data.retryAfterMs)
      return
    }
    await refresh()
  }

  return (
    <div className="center-screen">
      <form
        className="panel card"
        style={{ maxWidth: 380, alignItems: 'center', textAlign: 'center' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (wait <= 0 && pin.length >= 4) void submit()
        }}
      >
        <Lock size={28} aria-hidden />
        <h1>DailyPot is locked</h1>
        <label className="field" style={{ width: '100%' }}>
          <span className="sr-only">PIN</span>
          <input
            className="input pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            aria-invalid={!!error}
          />
        </label>
        {error ? <p className="err">{error}</p> : null}
        {wait > 0 ? <p className="faint">Try again in {Math.ceil(wait / 1000)}s</p> : null}
        <button className="btn primary" style={{ width: '100%' }} disabled={wait > 0 || pin.length < 4}>
          Unlock
        </button>
        <p className="faint">
          Forgot your PIN? There’s no recovery. Close DailyPot and delete <code>security.json</code> in your DailyPot data folder to remove the PIN — your data stays.
        </p>
      </form>
    </div>
  )
}
