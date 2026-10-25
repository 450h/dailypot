/** Nudge footer (docs/09 §6.14): non-urgent banners — new cycle started, backup export overdue. */
import type { ReactNode } from 'react'
import { formatMoney } from '@shared/money'
import type { Cycle } from '@shared/schema'
import { Banner, Widget } from '../../components/ui'
import { BACKUP_NUDGE_DAYS, exportAgeDays, useReady } from '../../state/app'

export function Nudges({ cycle, onChangeAllowance }: { cycle: Cycle; onChangeAllowance: () => void }): React.JSX.Element | null {
  const { state, derived, meta, run } = useReady()
  const { today, currency } = derived
  const A = cycle.dailyAllowance
  // Same helper and threshold as the sidebar's backup dot, so the two never disagree.
  const exportAge = exportAgeDays(state.settings.lastExportAt, today)

  const items: ReactNode[] = []
  if (meta.newCycleStarted) {
    items.push(
      <Banner
        key="cycle"
        tone="ok"
        role="status"
        actions={
          <>
            <button type="button" className="btn sm primary" onClick={() => void run(window.dailypot.setAllowance(A), 'Per-day kept')}>
              Keep {formatMoney(A, currency)}
            </button>
            <button type="button" className="btn sm" onClick={onChangeAllowance}>
              Change
            </button>
          </>
        }
      >
        A new cycle started. Your per-day is <strong>{formatMoney(A, currency)}</strong> — keep it or change it.
      </Banner>
    )
  }
  if (exportAge === null || exportAge >= BACKUP_NUDGE_DAYS) {
    items.push(
      <Banner
        key="export"
        tone="info"
        actions={
          <button type="button" className="btn sm" onClick={() => void run(window.dailypot.dataExport(), 'Exported')}>
            Export now
          </button>
        }
      >
        {exportAge === null ? 'You haven’t exported a backup yet.' : `Last export ${exportAge} days ago.`} Automatic backups live on this PC only — export a copy to OneDrive or a
        USB drive.
      </Banner>
    )
  }
  if (items.length === 0) return null
  return (
    <Widget span={12} index={13} variant="flat" className="nudges">
      <div className="stack">{items}</div>
    </Widget>
  )
}
