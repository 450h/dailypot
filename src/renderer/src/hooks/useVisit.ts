/**
 * Visit counter (docs/09 §6): increments every time `active` turns true. The Shell renders
 * `<Dashboard key={visit} />` so the whole page remounts, and the "goes to print" choreography
 * replays on every entry. Starts at 1 when `active` is true on first render, 0 otherwise.
 */
import { useState } from 'react'

export function useVisit(active: boolean): number {
  const [tracked, setTracked] = useState(() => ({ active, visit: active ? 1 : 0 }))
  if (tracked.active !== active) {
    // Derive state from the prop change during render (React's documented pattern); no effect needed.
    const next = { active, visit: active ? tracked.visit + 1 : tracked.visit }
    setTracked(next)
    return next.visit
  }
  return tracked.visit
}
