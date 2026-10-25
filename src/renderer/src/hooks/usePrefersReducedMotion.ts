/**
 * `prefers-reduced-motion: reduce` as a live boolean (docs/09 §7.4, §7.6).
 * Subscribes to the media query so a Windows "Animation effects" toggle applies without a restart.
 * Every animated atom and hook reads this; never hard-code `isAnimationActive`.
 */
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

let mql: MediaQueryList | null = null
const media = (): MediaQueryList => (mql ??= window.matchMedia(QUERY))

function subscribe(onChange: () => void): () => void {
  const mq = media()
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const read = (): boolean => media().matches

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
