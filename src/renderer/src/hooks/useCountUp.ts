/**
 * Counting numerals (docs/09 §7.3). rAF loop, easeOutExpo, integer minor units, exact snap.
 *
 * - `from` is 0 on mount; later target changes on the same mount count from the value last shown.
 *   With an `id` the last shown value is also kept in the enclosing <CountScope> (one per page mount),
 *   so a figure that moves between components (a re-sorted row) continues instead of restarting.
 * - Reduced motion: returns the target immediately, settled.
 * - Hidden window: rAF does not fire; when it resumes the count snaps to the target.
 * - Open dialog (`[aria-modal="true"]`): the count pauses, requests no frames while paused, and resumes from the
 *   shown value when the dialog closes (the initial `delay` is not re-applied). The gate is event-driven: one DOM
 *   query per dialog open/close, never one per frame.
 * - Only `components/ui.tsx` calls this hook; pages render `<Count>` (money) or `<Count integer>` (plain numbers).
 */
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatAmount } from '@shared/money'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export interface CountUpOptions {
  /** ms, default 900 (`--dur-4`). */
  duration?: number
  /** ms before the count starts, default 0. Widgets pass their stagger delay here. */
  delay?: number
  /** Stable name for the figure, lets the value survive a remount inside the same page (see CountScope). */
  id?: string
  /** Explicit start value; overrides the remembered one. */
  from?: number
}

export interface CountUpResult {
  /** Integer minor units currently shown. */
  value: number
  /** `formatAmount(value)` — the text to render. */
  text: string
  /** True once the value equals the target and the loop has stopped. */
  settled: boolean
  /** Where the current count started (the value shown when the target last changed), for width locking. */
  from: number
}

/** JS twin of `--ease-out` for count-ups. */
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

const ScopeCtx = createContext<Map<string, number> | null>(null)

/** Remembers the last shown value per `id` for the lifetime of the scope. The Shell keys one per page visit. */
export function CountScope({ children }: { children: ReactNode }): React.JSX.Element {
  const [map] = useState(() => new Map<string, number>())
  return createElement(ScopeCtx.Provider, { value: map }, children)
}

/** "May counts run?" — false while the document is hidden or a dialog is open. Waiters are woken once when it reopens. */
export interface CountGate {
  blocked(): boolean
  /** Registers a one-shot callback for the next unblock; returns an unsubscribe. */
  wait(resume: () => void): () => void
}

function makeGate(): CountGate {
  let hidden = false
  let modal = false
  let installed = false
  const waiters = new Set<() => void>()
  const wake = (): void => {
    if (hidden || modal) return
    const w = [...waiters]
    waiters.clear()
    for (const f of w) f()
  }
  const hasModal = (): boolean => document.querySelector('[aria-modal="true"]') !== null
  // Listeners attach on first use, so importing this module outside a browser (unit tests) is harmless.
  const install = (): void => {
    if (installed || typeof document === 'undefined') return
    installed = true
    hidden = document.hidden
    modal = hasModal()
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden
      wake()
    })
    // `Modal` portals its overlay to <body>, so a dialog opening or closing is a change in body's child list.
    new MutationObserver(() => {
      const m = hasModal()
      if (m !== modal) {
        modal = m
        wake()
      }
    }).observe(document.body, { childList: true })
  }
  return {
    blocked: () => {
      install()
      return hidden || modal
    },
    wait: (resume) => {
      waiters.add(resume)
      return () => waiters.delete(resume)
    }
  }
}

export const countGate: CountGate = makeGate()

export interface CountRun {
  start: number
  target: number
  /** ms before the count starts. */
  delay: number
  duration: number
  gate: CountGate
  raf: (cb: (now: number) => void) => number
  caf: (id: number) => void
  /** Called with each shown value; `settled` is true exactly once, with `target`. */
  show: (value: number, settled: boolean) => void
}

/** The frame loop behind `useCountUp`, free of React so it can be driven by a fake clock in tests. Returns a cancel. */
export function runCount(run: CountRun): () => void {
  const { target, delay, duration, gate } = run
  let start = run.start
  let shown = start
  let raf = 0
  let t0: number | null = null
  let paused = false
  let unwait: (() => void) | null = null
  function schedule(): void {
    raf = run.raf(tick)
  }
  function tick(now: number): void {
    if (gate.blocked()) {
      // Pause without polling: one wake-up when the gate opens.
      paused = true
      unwait = gate.wait(() => {
        unwait = null
        schedule()
      })
      return
    }
    if (paused) {
      // Resume: ease from the value on screen over a fresh `duration`; the initial delay has already elapsed.
      paused = false
      start = shown
      t0 = now - delay
    }
    if (t0 === null) t0 = now
    const t = Math.min(1, Math.max(0, (now - t0 - delay) / duration))
    if (t >= 1) {
      run.show(target, true)
      return
    }
    shown = Math.round(start + (target - start) * easeOutExpo(t))
    run.show(shown, false)
    schedule()
  }
  schedule()
  return () => {
    run.caf(raf)
    unwait?.()
  }
}

interface Frame {
  value: number
  settled: boolean
  from: number
}

export function useCountUp(target: number, opts: CountUpOptions = {}): CountUpResult {
  const { duration = 900, delay = 0, id, from } = opts
  const reduced = usePrefersReducedMotion()
  const scope = useContext(ScopeCtx)
  const shown = useRef<number | null>(null)
  const [frame, setFrame] = useState<Frame>(() => ({ value: from ?? 0, settled: false, from: from ?? 0 }))

  useEffect(() => {
    if (reduced) {
      shown.current = target
      if (id) scope?.set(id, target)
      return
    }
    const remembered = id ? scope?.get(id) : undefined
    const start = from ?? shown.current ?? remembered ?? 0
    const show = (v: number, settled: boolean): void => {
      shown.current = v
      if (id) scope?.set(id, v)
      // Bail out when nothing changed (every frame of the delay window shows the same value).
      setFrame((p) => (p.value === v && p.settled === settled && p.from === start ? p : { value: v, settled, from: start }))
    }
    if (start === target) {
      // Nothing to count: settle on the next frame (keeps setState out of the effect body).
      const raf = requestAnimationFrame(() => show(target, true))
      return () => cancelAnimationFrame(raf)
    }
    return runCount({ start, target, delay, duration, gate: countGate, raf: (cb) => requestAnimationFrame(cb), caf: (n) => cancelAnimationFrame(n), show })
  }, [target, duration, delay, id, from, reduced, scope])

  if (reduced) return { value: target, text: formatAmount(target), settled: true, from: target }
  return { value: frame.value, text: formatAmount(frame.value), settled: frame.settled && frame.value === target, from: frame.from }
}
