/**
 * Command service behind the IPC channels. No Electron imports: dialogs and shell actions are
 * injected so lock checks, validation and referential rules are unit-testable (SECURITY §1).
 */
import { promises as fs } from 'node:fs'
import { todayLocal } from '@shared/dates'
import type { BackupInfo, PinStatus, StatePayload } from '@shared/ipc'
import type { AppState } from '@shared/schema'
import * as cmd from './commands'
import { transactionsCsv } from './csv'
import type { PinLock } from './pin'
import type { Store } from './store'

export interface Platform {
  version: string
  saveDialog(defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openDialog(filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  confirm(message: string, detail: string): Promise<boolean>
  openFolder(path: string): Promise<void>
  openRepo(): Promise<void>
}

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class Service {
  newCycleStarted = false

  constructor(
    private readonly store: Store,
    private readonly pin: PinLock,
    private readonly platform: Platform,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  private ctx(): cmd.Ctx {
    const d = this.now()
    return { today: todayLocal(d), nowIso: d.toISOString(), newId: this.newId }
  }

  private unlocked(): void {
    if (this.pin.locked) throw new ServiceError('LOCKED', 'DailyPot is locked')
  }

  payload(): StatePayload {
    const locked = this.pin.locked
    return {
      // Never send data while locked.
      state: locked ? cmd.redacted(this.store.state) : this.store.state,
      meta: {
        ...this.store.meta,
        newCycleStarted: this.newCycleStarted,
        dataPath: this.store.dir,
        version: this.platform.version,
        today: this.ctx().today,
        locked,
        pinSet: this.pin.pinSet
      }
    }
  }

  /** Every write computes from the latest committed state inside the store queue (no lost updates). */
  private async apply(fn: (s: AppState, ctx: cmd.Ctx) => AppState): Promise<StatePayload> {
    this.unlocked()
    await this.store.update((s) => fn(s, this.ctx()))
    return this.payload()
  }

  /** Append cycles up to today (startup and midnight). Returns true if any were added. */
  async rollCycles(): Promise<boolean> {
    if (this.store.meta.readOnly || this.store.meta.recoveryNeeded) return false
    let added = 0
    await this.store.update((s) => {
      const r = cmd.rollCycles(s, this.ctx())
      added = r.added
      return r.state
    })
    if (added > 0) this.newCycleStarted = true
    return added > 0
  }

  getState(): StatePayload {
    return this.payload()
  }

  upsert(collection: unknown, item: unknown): Promise<StatePayload> {
    return this.apply((s, c) => cmd.upsertEntity(s, collection, item, c))
  }

  remove(collection: unknown, id: unknown): Promise<StatePayload> {
    return this.apply((s) => cmd.deleteEntity(s, collection, id))
  }

  updateSettings(patch: unknown): Promise<StatePayload> {
    return this.apply((s) => cmd.updateSettings(s, patch))
  }

  async completeSetup(payload: unknown): Promise<StatePayload> {
    this.unlocked()
    await this.store.update((s) => cmd.completeSetup(s, payload, this.ctx()))
    const pin = (payload as { pin?: unknown }).pin
    if (pin !== undefined) await this.pin.set(undefined, pin)
    return this.payload()
  }

  setAllowance(amount: unknown): Promise<StatePayload> {
    this.newCycleStarted = false
    return this.apply((s, c) => cmd.setAllowance(s, amount, c))
  }

  startNextEarly(startDate: unknown): Promise<StatePayload> {
    return this.apply((s, c) => cmd.startNextEarly(s, startDate, c))
  }

  // ----- PIN -----
  pinStatus(): PinStatus {
    return this.pin.status()
  }
  async pinVerify(pinValue: unknown): Promise<PinStatus> {
    await this.pin.verify(pinValue)
    return this.pin.status()
  }
  async pinSet(current: unknown, next: unknown): Promise<PinStatus> {
    this.unlocked()
    await this.pin.set(current, next)
    return this.pin.status()
  }
  async pinClear(current: unknown): Promise<PinStatus> {
    this.unlocked()
    await this.pin.clear(current)
    return this.pin.status()
  }
  pinLock(): PinStatus {
    this.pin.lock()
    return this.pin.status()
  }

  // ----- backups & data -----
  async backupList(): Promise<BackupInfo[]> {
    this.unlocked()
    return this.store.listBackups()
  }

  async backupRestore(name: unknown): Promise<StatePayload | null> {
    this.unlocked()
    if (typeof name !== 'string') throw new ServiceError('INVALID', 'Invalid backup name')
    const state = await this.store.readBackup(name)
    const ok = await this.platform.confirm(`Restore ${name}?`, `${cmd.summarize(state)}.\nThis replaces all current data. A backup of the current data is written first.`)
    if (!ok) return null
    await this.store.replaceAll(state, 'restore')
    await this.rollCycles()
    return this.payload()
  }

  async backupOpenFolder(): Promise<null> {
    this.unlocked()
    await this.platform.openFolder(this.store.backupsDir)
    return null
  }

  async dataExport(): Promise<StatePayload | null> {
    this.unlocked()
    const path = await this.platform.saveDialog(`dailypot-export-${this.ctx().today}.json`, [{ name: 'JSON', extensions: ['json'] }])
    if (!path) return null
    await this.store.exportTo(path)
    if (!this.store.meta.readOnly && !this.store.meta.recoveryNeeded) {
      const nowIso = this.ctx().nowIso
      await this.store.update((s) => ({ ...s, settings: { ...s.settings, lastExportAt: nowIso } }))
    }
    return this.payload()
  }

  async dataImport(): Promise<StatePayload | null> {
    this.unlocked()
    const path = await this.platform.openDialog([{ name: 'DailyPot export', extensions: ['json'] }])
    if (!path) return null
    const state = await this.store.readStateFile(path)
    const ok = await this.platform.confirm('Import this file?', `${cmd.summarize(state)}.\nThis replaces ALL current data. A backup of the current data is written first.`)
    if (!ok) return null
    await this.store.replaceAll(state, 'import')
    await this.rollCycles()
    return this.payload()
  }

  async dataExportCsv(ids: unknown): Promise<boolean> {
    this.unlocked()
    const list = Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? (ids as string[]) : []
    const path = await this.platform.saveDialog(`dailypot-transactions-${this.ctx().today}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
    if (!path) return false
    await fs.writeFile(path, transactionsCsv(this.store.state, list), 'utf8')
    return true
  }

  async recoveryStartFresh(): Promise<StatePayload> {
    this.unlocked()
    if (!this.store.meta.recoveryNeeded) throw new ServiceError('INVALID', 'Nothing to recover')
    await this.store.startFresh()
    return this.payload()
  }

  async openRepo(): Promise<null> {
    await this.platform.openRepo()
    return null
  }
}
