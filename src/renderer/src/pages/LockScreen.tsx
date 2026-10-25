/**
 * F10 — PIN lock screen (docs/09 §8 "Lock screen"). Backoff is enforced in main; this only displays it.
 * Eight ink squares fill per digit while the real <input aria-label="PIN"> sits over them, transparent but
 * focused and fillable. Wrong PIN: `!` glyph + "Wrong PIN", a mono retry countdown, and a shake (not under
 * reduced motion).
 */
import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useApp } from '../state/app'

const BOXES = 8

export function LockScreen(): React.JSX.Element {
  const { refresh } = useApp()
  const reduced = usePrefersReducedMotion()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [focused, setFocused] = useState(true)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1000)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  useEffect(() => {
    if (!shaking) return
    const t = setTimeout(() => setShaking(false), 350)
    return () => clearTimeout(t)
  }, [shaking])

  const fail = (message: string, retryAfterMs: number): void => {
    setError(message)
    setWait(retryAfterMs)
    if (!reduced) setShaking(true)
  }

  const submit = async (): Promise<void> => {
    const r = await window.dailypot.pinVerify(pin)
    setPin('')
    if (!r.ok) {
      const s = await window.dailypot.pinStatus()
      fail(r.message, s.ok ? s.data.retryAfterMs : 0)
      return
    }
    if (r.data.locked) {
      fail('Wrong PIN', r.data.retryAfterMs)
      return
    }
    await refresh()
  }

  const canSubmit = wait <= 0 && pin.length >= 4

  return (
    <div className="center-screen">
      <form
        className="panel card"
        style={{ width: 'min(440px, 100%)' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) void submit()
        }}
      >
        <div className="poster-head">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">DailyPot</span>
          </div>
          <p className="dateline">Privacy screen · enter your PIN</p>
          <h1>DailyPot is locked</h1>
        </div>

        {/* The squares are decoration for the real input laid over them (transparent, so Playwright's getByLabel('PIN').fill() works).
            The shake lives on this wrapper, not on .panel, so the panel's own entrance never replays. */}
        <div className={shaking ? 'shake' : undefined} style={{ position: 'relative' }}>
          <div className={`pin-boxes ${error ? 'error' : ''}`} aria-hidden="true">
            {Array.from({ length: BOXES }, (_, i) => (
              <span key={i} className={`pin-box ${i < pin.length ? 'filled' : ''} ${focused && i === pin.length ? 'active' : ''}`} />
            ))}
          </div>
          <input
            aria-label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={BOXES}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''))
              if (error) setError(null)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-invalid={!!error}
            aria-describedby={error ? 'pin-error' : wait > 0 ? 'pin-wait' : undefined}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 0, background: 'transparent', color: 'transparent', caretColor: 'transparent', cursor: 'text' }}
          />
        </div>
        <p className="faint" style={{ textAlign: 'center' }}>
          {pin.length === 0 ? 'Type 4 to 8 digits, then press Enter.' : `${pin.length} of up to ${BOXES} digits`}
        </p>

        {error ? (
          <p id="pin-error" className="err" role="alert" style={{ textAlign: 'center' }}>
            <span className="glyph" aria-hidden="true">
              !
            </span>{' '}
            <span>{error}</span>
          </p>
        ) : null}
        {wait > 0 ? (
          <p id="pin-wait" className="faint mono" style={{ textAlign: 'center' }}>
            Try again in {Math.ceil(wait / 1000)}s
          </p>
        ) : null}

        <button className="btn primary block" disabled={!canSubmit}>
          Unlock
        </button>
        <p className="faint">
          Forgot your PIN? There’s no recovery. Close DailyPot and delete <code>security.json</code> in your DailyPot data folder to remove the PIN — your data stays.
        </p>
      </form>
    </div>
  )
}
