import { describe, expect, it } from 'vitest'
import { easeOutExpo, runCount, type CountGate } from './useCountUp'

/** A manual rAF queue with its own clock. */
function fakeFrames() {
  let queue: Array<{ id: number; cb: (now: number) => void }> = []
  let next = 1
  let now = 0
  return {
    raf: (cb: (now: number) => void): number => {
      const id = next++
      queue.push({ id, cb })
      return id
    },
    caf: (id: number): void => {
      queue = queue.filter((q) => q.id !== id)
    },
    pending: (): number => queue.length,
    step: (ms = 16): void => {
      now += ms
      const q = queue
      queue = []
      for (const { cb } of q) cb(now)
    }
  }
}

function fakeGate(initial: boolean) {
  let blocked = initial
  let checks = 0
  const waiters = new Set<() => void>()
  const gate: CountGate = {
    blocked: () => {
      checks++
      return blocked
    },
    wait: (f) => {
      waiters.add(f)
      return () => waiters.delete(f)
    }
  }
  return {
    gate,
    set: (b: boolean): void => {
      blocked = b
      if (b) return
      const w = [...waiters]
      waiters.clear()
      for (const f of w) f()
    },
    checks: () => checks,
    waiters: () => waiters.size
  }
}

describe('runCount (docs/09 §7.3 counting numerals)', () => {
  it('eases from start to target after the delay and snaps exactly to the target', () => {
    const f = fakeFrames()
    const g = fakeGate(false)
    const seen: Array<[number, boolean]> = []
    runCount({ start: 0, target: 100_000, delay: 100, duration: 500, gate: g.gate, raf: f.raf, caf: f.caf, show: (v, s) => seen.push([v, s]) })
    for (let i = 0; i < 6; i++) f.step() // 96ms: still in the delay window, shows the start value
    expect(seen.every(([v, s]) => v === 0 && !s)).toBe(true)
    for (let i = 0; i < 20; i++) f.step() // 416ms in: climbing
    const mid = seen.at(-1)!
    expect(mid[0]).toBeGreaterThan(0)
    expect(mid[0]).toBeLessThan(100_000)
    expect(mid[1]).toBe(false)
    for (let i = 0; i < 40; i++) f.step()
    expect(seen.at(-1)).toEqual([100_000, true])
    expect(seen.filter(([, s]) => s)).toHaveLength(1)
    expect(f.pending()).toBe(0) // the loop stopped
    expect(easeOutExpo(1)).toBe(1)
  })

  it('pauses behind a dialog without requesting frames or polling, then resumes from the shown value with no second delay', () => {
    const f = fakeFrames()
    const g = fakeGate(false)
    let last = 0
    runCount({ start: 0, target: 100_000, delay: 0, duration: 600, gate: g.gate, raf: f.raf, caf: f.caf, show: (v) => (last = v) })
    for (let i = 0; i < 10; i++) f.step()
    const atPause = last
    expect(atPause).toBeGreaterThan(0)
    g.set(true) // a dialog opens
    f.step()
    const checksWhenPaused = g.checks()
    expect(f.pending()).toBe(0) // no rAF while blocked
    expect(g.waiters()).toBe(1)
    for (let i = 0; i < 60; i++) f.step() // a second passes with the dialog open
    expect(g.checks()).toBe(checksWhenPaused) // the gate was not polled
    expect(last).toBe(atPause)
    g.set(false) // the dialog closes: exactly one frame is requested
    expect(f.pending()).toBe(1)
    f.step() // resume tick: continues from the shown value
    expect(last).toBe(atPause)
    f.step() // and moves on the very next frame (no 900ms delay re-applied)
    expect(last).toBeGreaterThan(atPause)
    for (let i = 0; i < 60; i++) f.step()
    expect(last).toBe(100_000)
  })

  it('cancel stops the loop and drops a pending waiter', () => {
    const f = fakeFrames()
    const g = fakeGate(true)
    const cancel = runCount({ start: 0, target: 5000, delay: 0, duration: 300, gate: g.gate, raf: f.raf, caf: f.caf, show: () => {} })
    f.step()
    expect(g.waiters()).toBe(1)
    cancel()
    expect(g.waiters()).toBe(0)
    g.set(false)
    expect(f.pending()).toBe(0)
  })
})
