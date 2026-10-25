/**
 * Renderer state: holds the latest StatePayload from main and derives every figure
 * from the pure shared engine (docs/04). No business rules live here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, diffDays, type ISODate } from '@shared/dates'
import { computeBalance, computePot, currentCycle, netWorth, sortCycles, unloggedDays, type BalanceResult, type DayRow, type NetWorth, type PotResult } from '@shared/engine'
import type { IpcResult, StatePayload } from '@shared/ipc'
import type { AppState, Category, Cycle } from '@shared/schema'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
}

/** Engine results memoised per payload (DEVELOPMENT-FRAMEWORK §10): widgets never recompute. */
export interface Derived {
  today: string
  cycles: Cycle[]
  current: Cycle | undefined
  pot: PotResult
  /** Main balance as of today (ADR-0007, docs/05 §10): anchored or "change since the first cycle". */
  balance: BalanceResult
  /** cash + savings + investments (docs/05 §10). */
  netWorth: NetWorth
  /** Closed, unlogged days from 7 days before the current cycle to today, newest first; [] without a pot. */
  unlogged: DayRow[]
  categories: Map<string, Category>
  currency: string
}

/** Data and actions; memoised so it changes only with the payload, never with a toast tick. */
interface AppCtx {
  payload: StatePayload | null
  state: AppState | null
  derived: Derived | null
  loadError: string | null
  /** Runs an IPC call; applies returned state, toasts errors. Returns data or undefined on failure. */
  run<T>(call: Promise<IpcResult<T>>, success?: string): Promise<T | undefined>
  toast(message: string, opts?: { kind?: Toast['kind']; action?: Toast['action'] }): void
  refresh(): Promise<void>
}

/** The toast list lives in its own context so only the tray re-renders when a toast appears or expires. */
interface ToastCtx {
  toasts: Toast[]
  dismiss(id: number): void
}

const Ctx = createContext<AppCtx | null>(null)
const ToastsCtx = createContext<ToastCtx | null>(null)

/** Days since the last backup export (clamped at 0), or null when never exported. Sidebar and nudge share it. */
export const BACKUP_NUDGE_DAYS = 30
export const exportAgeDays = (lastExportAt: string | undefined, today: ISODate): number | null => (lastExportAt ? Math.max(0, diffDays(lastExportAt.slice(0, 10), today)) : null)

const isPayload = (x: unknown): x is StatePayload =>
  typeof x === 'object' && x !== null && 'state' in x && 'meta' in x

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [payload, setPayload] = useState<StatePayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextToast = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<AppCtx['toast']>(
    (message, opts) => {
      const id = nextToast.current++
      setToasts((t) => [...t.slice(-3), { id, message, kind: opts?.kind ?? 'info', ...(opts?.action ? { action: opts.action } : {}) }])
      setTimeout(() => dismiss(id), opts?.action ? 8000 : 4500)
    },
    [dismiss]
  )

  const refresh = useCallback(async () => {
    const r = await window.dailypot.getState()
    if (r.ok) {
      setPayload(r.data)
      setLoadError(null)
    } else setLoadError(r.message)
  }, [])

  const run = useCallback<AppCtx['run']>(
    async (call, success) => {
      try {
        const r = await call
        if (!r.ok) {
          if (r.code === 'LOCKED') await refresh()
          toast(r.message, { kind: 'error' })
          return undefined
        }
        if (isPayload(r.data)) setPayload(r.data)
        if (success && r.data !== null && r.data !== false) toast(success)
        return r.data
      } catch {
        toast('Something went wrong talking to the app process', { kind: 'error' })
        return undefined
      }
    },
    [refresh, toast]
  )

  useEffect(() => {
    let alive = true
    void window.dailypot.getState().then((r) => {
      if (!alive) return
      if (r.ok) setPayload(r.data)
      else setLoadError(r.message)
    })
    const off = window.dailypot.onEvent(() => void refresh())
    return () => {
      alive = false
      off()
    }
  }, [refresh])

  // Theme: data-theme on <html> only when the user overrides the system preference.
  const theme = payload?.state.settings.theme ?? 'system'
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const derived = useMemo<Derived | null>(() => {
    if (!payload || payload.meta.locked) return null
    const { state, meta } = payload
    const cycles = sortCycles(state.cycles)
    const current = currentCycle(cycles, meta.today)
    const pot = computePot(state, meta.today)
    return {
      today: meta.today,
      cycles,
      current,
      pot,
      balance: computeBalance(state, meta.today),
      netWorth: netWorth(state, meta.today),
      unlogged: pot.firstDate === null ? [] : unloggedDays(pot, current ? addDays(current.startDate, -7) : undefined, meta.today),
      categories: new Map(state.categories.map((c) => [c.id, c])),
      currency: state.settings.currency
    }
  }, [payload])

  // run/toast/refresh are stable callbacks and `derived` follows `payload`, so this identity changes only with the data.
  const value = useMemo<AppCtx>(() => ({ payload, state: payload?.state ?? null, derived, loadError, run, toast, refresh }), [payload, derived, loadError, run, toast, refresh])
  const toastValue = useMemo<ToastCtx>(() => ({ toasts, dismiss }), [toasts, dismiss])
  return (
    <Ctx.Provider value={value}>
      <ToastsCtx.Provider value={toastValue}>{children}</ToastsCtx.Provider>
    </Ctx.Provider>
  )
}

export function useApp(): AppCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

/** The toast tray only. */
export function useToasts(): ToastCtx {
  const v = useContext(ToastsCtx)
  if (!v) throw new Error('useToasts outside AppProvider')
  return v
}

/** For pages that only render once set up and unlocked. */
export function useReady(): { state: AppState; derived: Derived; meta: StatePayload['meta'] } & Omit<AppCtx, 'state' | 'derived'> {
  const app = useApp()
  if (!app.state || !app.derived || !app.payload) throw new Error('useReady before data loaded')
  return { ...app, state: app.state, derived: app.derived, meta: app.payload.meta }
}

export const newId = (): string => crypto.randomUUID()
