/**
 * Local JSON store (ADR-0002): the only code that touches data.json.
 * Atomic writes, daily snapshots, corruption fallback, migrations, read-only for newer schemas.
 */
import { promises as fs } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { todayLocal } from '@shared/dates'
import { SCHEMA_VERSION, emptyState, type AppState } from '@shared/schema'
import { integrityError } from './commands'

export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const SNAPSHOTS_KEPT = 14
export const BACKUP_NAME_RE = /^(data-\d{4}-\d{2}-\d{2}|pre-(import|restore|migration)-\d{8}T\d{6})\.json$/
const SNAPSHOT_RE = /^data-\d{4}-\d{2}-\d{2}\.json$/

export interface StoreMeta {
  readOnly: boolean
  restoredFromBackup: boolean
  recoveryNeeded: boolean
}

export interface StoreOptions {
  now?: () => Date
  newId?: () => string
  /** Injected for tests (simulates EPERM/EBUSY). */
  rename?: (from: string, to: string) => Promise<void>
  sleep?: (ms: number) => Promise<void>
  /** Injected for tests; defaults to the real migration table. */
  migrations?: Record<number, Migration>
}

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export function timestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>
/** Forward-only migrations: MIGRATIONS[n] upgrades schemaVersion n → n+1. */
const MIGRATIONS: Record<number, Migration> = {}

export function migrate(raw: unknown, migrations: Record<number, Migration> = MIGRATIONS): { value: unknown; migrated: boolean; tooNew: boolean } {
  if (typeof raw !== 'object' || raw === null) return { value: raw, migrated: false, tooNew: false }
  let obj = raw as Record<string, unknown>
  let v = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : NaN
  if (v > SCHEMA_VERSION) return { value: raw, migrated: false, tooNew: true }
  let migrated = false
  while (v < SCHEMA_VERSION) {
    const step = migrations[v]
    if (!step) break
    obj = { ...step(obj), schemaVersion: v + 1 }
    v++
    migrated = true
  }
  return { value: obj, migrated, tooNew: false }
}

/** Parse + migrate + validate a file's text. */
export function parseStateText(
  text: string,
  migrations: Record<number, Migration> = MIGRATIONS
): { state: AppState; migrated: boolean } | { error: string; tooNew?: boolean } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: 'The file is not valid JSON' }
  }
  const m = migrate(raw, migrations)
  if (m.tooNew) return { error: 'This file was made by a newer version of DailyPot', tooNew: true }
  const r = integrityError(m.value)
  return 'error' in r ? { error: r.error } : { state: r.state, migrated: m.migrated }
}

export class Store {
  readonly dataFile: string
  readonly backupsDir: string
  state: AppState
  meta: StoreMeta = { readOnly: false, restoredFromBackup: false, recoveryNeeded: false }
  private queue: Promise<unknown> = Promise.resolve()
  private readonly now: () => Date
  private readonly newId: () => string
  private readonly renameFn: (from: string, to: string) => Promise<void>
  private readonly sleep: (ms: number) => Promise<void>
  private readonly migrations: Record<number, Migration> | undefined

  constructor(
    readonly dir: string,
    opts: StoreOptions = {}
  ) {
    this.dataFile = join(dir, 'data.json')
    this.backupsDir = join(dir, 'backups')
    this.now = opts.now ?? (() => new Date())
    this.newId = opts.newId ?? (() => crypto.randomUUID())
    this.renameFn = opts.rename ?? fs.rename
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.migrations = opts.migrations
    this.state = emptyState(this.newId)
  }

  async load(): Promise<void> {
    await fs.mkdir(this.backupsDir, { recursive: true })
    let text: string
    try {
      text = await fs.readFile(this.dataFile, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = emptyState(this.newId)
        return
      }
      throw e
    }
    const r = parseStateText(text, this.migrations)
    if ('state' in r) {
      this.state = r.state
      if (r.migrated) {
        await this.copyToBackup(`pre-migration-${timestamp(this.now())}.json`)
        await this.writeAtomic(r.state)
      }
      return
    }
    if (r.tooNew) {
      this.meta.readOnly = true
      this.state = emptyState(this.newId)
      return
    }
    // Corrupt: keep the file, fall back to the newest valid backup.
    await this.renameFn(this.dataFile, join(this.dir, `data.corrupt-${timestamp(this.now())}.json`))
    for (const b of await this.listBackups()) {
      const candidate = parseStateText(await fs.readFile(join(this.backupsDir, b.name), 'utf8'), this.migrations)
      if ('state' in candidate) {
        this.state = candidate.state
        this.meta.restoredFromBackup = true
        await this.writeAtomic(candidate.state)
        return
      }
    }
    this.meta.recoveryNeeded = true
    this.state = emptyState(this.newId)
  }

  /** Run `task` after every earlier queued write has finished (no lost updates). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(task, task)
    this.queue = p.catch(() => undefined)
    return p
  }

  private async write(next: AppState): Promise<AppState> {
    if (this.meta.readOnly) throw new StoreError('READ_ONLY', 'Data is read-only (made by a newer version)')
    if (this.meta.recoveryNeeded) throw new StoreError('RECOVERY', 'Recover or start fresh first')
    const r = integrityError(next)
    if ('error' in r) throw new StoreError('INTEGRITY', r.error)
    await this.snapshotIfNeeded()
    await this.writeAtomic(r.state)
    this.state = r.state
    return r.state
  }

  /**
   * Compute the next state from the *latest committed* state inside the write queue, then
   * validate, snapshot and write atomically. Returning the same object skips the write.
   */
  update(fn: (current: AppState) => AppState): Promise<AppState> {
    return this.enqueue(async () => {
      const next = fn(this.state)
      return next === this.state ? next : this.write(next)
    })
  }

  commit(next: AppState): Promise<AppState> {
    return this.update(() => next)
  }

  startFresh(): Promise<AppState> {
    return this.enqueue(async () => {
      this.meta.recoveryNeeded = false
      this.meta.restoredFromBackup = false
      return this.write(emptyState(this.newId))
    })
  }

  async listBackups(): Promise<Array<{ name: string; size: number; modified: string }>> {
    let names: string[]
    try {
      names = await fs.readdir(this.backupsDir)
    } catch {
      return []
    }
    const out = []
    for (const name of names.filter((n) => BACKUP_NAME_RE.test(n))) {
      const st = await fs.stat(join(this.backupsDir, name))
      out.push({ name, size: st.size, modified: st.mtime.toISOString() })
    }
    return out.sort((a, b) => (a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : a.name < b.name ? 1 : -1))
  }

  /** Validate a backup by name (allowlisted, inside backupsDir). */
  async readBackup(name: string): Promise<AppState> {
    if (!BACKUP_NAME_RE.test(name)) throw new StoreError('BAD_NAME', 'Invalid backup name')
    const full = resolve(this.backupsDir, name)
    if (!full.startsWith(resolve(this.backupsDir) + sep)) throw new StoreError('BAD_NAME', 'Invalid backup name')
    return this.readStateFile(full)
  }

  /** Read and fully validate any state file (imports and backups). */
  async readStateFile(path: string): Promise<AppState> {
    const st = await fs.stat(path)
    if (st.size > MAX_FILE_BYTES) throw new StoreError('TOO_LARGE', 'File is larger than 50 MB')
    const r = parseStateText(await fs.readFile(path, 'utf8'), this.migrations)
    if ('error' in r) throw new StoreError(r.tooNew ? 'TOO_NEW' : 'INVALID_FILE', r.error)
    return r.state
  }

  /** Replace all data after writing a pre-<kind> backup of the current file. */
  replaceAll(next: AppState, kind: 'import' | 'restore'): Promise<AppState> {
    return this.enqueue(async () => {
      if (this.meta.readOnly) throw new StoreError('READ_ONLY', 'Data is read-only (made by a newer version)')
      await this.copyToBackup(`pre-${kind}-${timestamp(this.now())}.json`)
      this.meta.recoveryNeeded = false
      return this.write(next)
    })
  }

  /** Export. Read-only mode copies the untouched file; recovery mode has nothing to export. */
  exportTo(path: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.meta.recoveryNeeded) throw new StoreError('RECOVERY', 'There is no readable data to export')
      if (this.meta.readOnly) await fs.copyFile(this.dataFile, path)
      else await fs.writeFile(path, JSON.stringify(this.state, null, 2), 'utf8')
    })
  }

  private async copyToBackup(name: string): Promise<void> {
    try {
      await fs.copyFile(this.dataFile, join(this.backupsDir, name))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }

  private async snapshotIfNeeded(): Promise<void> {
    const name = `data-${todayLocal(this.now())}.json`
    const target = join(this.backupsDir, name)
    try {
      await fs.access(target)
      return
    } catch {
      /* not yet taken today */
    }
    await this.copyToBackup(name)
    const snaps = (await fs.readdir(this.backupsDir)).filter((n) => SNAPSHOT_RE.test(n)).sort()
    for (const old of snaps.slice(0, Math.max(0, snaps.length - SNAPSHOTS_KEPT))) {
      await fs.rm(join(this.backupsDir, old), { force: true })
    }
  }

  private async writeAtomic(state: AppState): Promise<void> {
    const tmp = `${this.dataFile}.tmp`
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.writeFile(JSON.stringify(state), 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await this.renameFn(tmp, this.dataFile)
        return
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 5) {
          await this.sleep(50 * 2 ** attempt)
          continue
        }
        throw e
      }
    }
  }
}
