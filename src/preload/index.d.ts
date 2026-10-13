import type { DailyPotApi } from '../shared/ipc'

declare global {
  interface Window {
    dailypot: DailyPotApi
  }
}

export {}
