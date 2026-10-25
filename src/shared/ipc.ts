/** IPC contract between preload and main (docs/06 "API surface"). */
import { z } from 'zod'
import { CURRENCIES, MAX_AMOUNT } from './money'
import { zBalanceAnchor, zDate, type AppState, type EntityCollection } from './schema'

export interface StateMeta {
  readOnly: boolean
  restoredFromBackup: boolean
  recoveryNeeded: boolean
  newCycleStarted: boolean
  dataPath: string
  version: string
  today: string
  locked: boolean
  pinSet: boolean
}

export interface StatePayload {
  state: AppState
  meta: StateMeta
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export interface BackupInfo {
  name: string
  size: number
  modified: string
}

export interface PinStatus {
  pinSet: boolean
  locked: boolean
  retryAfterMs: number
}

export type AppEvent = { type: 'locked' } | { type: 'stateChanged' }

export const zPin = z.string().regex(/^\d{4,8}$/, 'PIN must be 4–8 digits')

export const zSettingsPatch = z
  .strictObject({
    currency: z.enum(CURRENCIES),
    payday: z.number().int().min(1).max(31),
    theme: z.enum(['system', 'light', 'dark']),
    autoLockMinutes: z.number().int().min(0).max(240),
    /** null clears the anchor; omitted leaves it unchanged. Its date must be ≤ today (docs/05 §10). */
    balanceAnchor: zBalanceAnchor.nullable()
  })
  .partial()

export const zSetupPayload = z.strictObject({
  currency: z.enum(CURRENCIES),
  payday: z.number().int().min(1).max(31),
  dailyAllowance: z.number().int().min(0).max(MAX_AMOUNT),
  firstCycleStart: zDate,
  obligations: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(40),
        amount: z.number().int().min(1).max(MAX_AMOUNT),
        dueDay: z.number().int().min(1).max(31)
      })
    )
    .max(100),
  pin: zPin.optional()
})

/** Extend tracking into the past (docs/05 §3 "Extend tracking back"). */
export const zExtendBackPayload = z.strictObject({
  startDate: zDate,
  dailyAllowance: z.number().int().min(0).max(MAX_AMOUNT),
  /** Confirm every new past day that the engine lists as unlogged as "spent nothing". */
  confirmDays: z.boolean(),
  /** Mark unsettled bill months due in the extended range (before today) as skipped: paid before tracking. Omitted = false. */
  skipPastBills: z.boolean().optional()
})

export type SettingsPatch = z.infer<typeof zSettingsPatch>
export type SetupPayload = z.infer<typeof zSetupPayload>
export type ExtendBackPayload = z.infer<typeof zExtendBackPayload>

/** The API exposed on window.dailypot by the preload script. */
export interface DailyPotApi {
  getState(): Promise<IpcResult<StatePayload>>
  upsert(collection: EntityCollection, item: unknown): Promise<IpcResult<StatePayload>>
  remove(collection: EntityCollection, id: string): Promise<IpcResult<StatePayload>>
  updateSettings(patch: SettingsPatch): Promise<IpcResult<StatePayload>>
  completeSetup(payload: SetupPayload): Promise<IpcResult<StatePayload>>
  setAllowance(dailyAllowance: number): Promise<IpcResult<StatePayload>>
  startNextEarly(startDate: string): Promise<IpcResult<StatePayload>>
  extendBack(payload: ExtendBackPayload): Promise<IpcResult<StatePayload>>
  pinStatus(): Promise<IpcResult<PinStatus>>
  pinVerify(pin: string): Promise<IpcResult<PinStatus>>
  pinSet(current: string | undefined, next: string): Promise<IpcResult<PinStatus>>
  pinClear(current: string): Promise<IpcResult<PinStatus>>
  pinLock(): Promise<IpcResult<PinStatus>>
  backupList(): Promise<IpcResult<BackupInfo[]>>
  backupRestore(name: string): Promise<IpcResult<StatePayload | null>>
  backupOpenFolder(): Promise<IpcResult<null>>
  dataExport(): Promise<IpcResult<StatePayload | null>>
  dataImport(): Promise<IpcResult<StatePayload | null>>
  dataExportCsv(ids: string[]): Promise<IpcResult<boolean>>
  recoveryStartFresh(): Promise<IpcResult<StatePayload>>
  openRepo(): Promise<IpcResult<null>>
  onEvent(cb: (e: AppEvent) => void): () => void
}

export { CHANNELS } from './channels'

export const REPO_URL = 'https://github.com/450h/dailypot'
