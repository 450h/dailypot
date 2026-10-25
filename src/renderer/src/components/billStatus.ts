/** Bill status → chip word, tone, glyph (docs/09 §4.8) and the row's status-bar colour. The one map every page uses. */
import type { InstanceStatus } from '@shared/engine'
import type { Tone } from './ui'

export const BILL_STATUS: Record<InstanceStatus, { label: string; tone: Tone; glyph: string; color: string }> = {
  paid: { label: 'Paid', tone: 'ok', glyph: '✓', color: 'var(--pos)' },
  skipped: { label: 'Skipped', tone: 'neutral', glyph: '–', color: 'var(--text-3)' },
  overdue: { label: 'Overdue', tone: 'danger', glyph: '!', color: 'var(--neg)' },
  dueToday: { label: 'Due today', tone: 'warn', glyph: '●', color: 'var(--warn)' },
  upcoming: { label: 'Upcoming', tone: 'info', glyph: '→', color: 'var(--info)' }
}
