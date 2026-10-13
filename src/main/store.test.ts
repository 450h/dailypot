import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyState, SCHEMA_VERSION, type AppState } from '@shared/schema'
import { completeSetup } from './commands'
import { BACKUP_NAME_RE, Store, StoreError } from './store'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'dailypot-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const at = (iso: string) => () => new Date(iso)
const setUp = (): AppState =>
  completeSetup(emptyState(randomUUID), { currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: '2026-10-13', obligations: [] }, {
    today: '2026-10-13',
    nowIso: '2026-10-13T10:00:00Z',
    newId: randomUUID
  })

describe('Store (ADR-0002)', () => {
  it('starts empty without writing, then commits atomically', async () => {
    const store = new Store(dir, { now: at('2026-10-13T10:00:00') })
    await store.load()
    expect(store.state.settings.setupComplete).toBe(false)
    await expect(fs.access(store.dataFile)).rejects.toThrow()
    await store.commit(setUp())
    const onDisk = JSON.parse(await fs.readFile(store.dataFile, 'utf8')) as AppState
    expect(onDisk.settings.setupComplete).toBe(true)
    await expect(fs.access(`${store.dataFile}.tmp`)).rejects.toThrow()
  })

  it('takes one snapshot per day before the first write and keeps 14', async () => {
    let now = new Date('2026-10-01T09:00:00')
    const store = new Store(dir, { now: () => now })
    await store.load()
    await store.commit(setUp())
    for (let d = 2; d <= 20; d++) {
      now = new Date(`2026-10-${String(d).padStart(2, '0')}T09:00:00`)
      await store.commit({ ...store.state })
      await store.commit({ ...store.state })
    }
    const snaps = (await fs.readdir(store.backupsDir)).filter((n) => n.startsWith('data-')).sort()
    expect(snaps).toHaveLength(14)
    expect(snaps.at(-1)).toBe('data-2026-10-20.json')
  })

  it('refuses invalid state on commit', async () => {
    const store = new Store(dir)
    await store.load()
    const bad = { ...setUp(), cycles: [] as AppState['cycles'] }
    await expect(store.commit(bad)).rejects.toBeInstanceOf(StoreError)
  })

  it('retries the rename on EPERM/EBUSY (antivirus)', async () => {
    let failures = 2
    const store = new Store(dir, {
      sleep: async () => undefined,
      rename: async (a, b) => {
        if (failures-- > 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        await fs.rename(a, b)
      }
    })
    await store.load()
    await store.commit(setUp())
    expect(JSON.parse(await fs.readFile(store.dataFile, 'utf8')).settings.setupComplete).toBe(true)
  })

  it('falls back to the newest valid snapshot when data.json is corrupt (T3)', async () => {
    const good = setUp()
    await fs.mkdir(join(dir, 'backups'), { recursive: true })
    await fs.writeFile(join(dir, 'backups', 'data-2026-10-12.json'), JSON.stringify(good))
    await fs.writeFile(join(dir, 'data.json'), '{ not json')
    const store = new Store(dir, { now: at('2026-10-13T10:00:00') })
    await store.load()
    expect(store.meta.restoredFromBackup).toBe(true)
    expect(store.state.cycles).toHaveLength(1)
    const files = await fs.readdir(dir)
    expect(files.some((f) => /^data\.corrupt-\d{8}T\d{6}\.json$/.test(f))).toBe(true)
  })

  it('shows recovery (never a silent fresh start) when no snapshot is valid', async () => {
    await fs.writeFile(join(dir, 'data.json'), '{ not json')
    const store = new Store(dir)
    await store.load()
    expect(store.meta.recoveryNeeded).toBe(true)
    await expect(store.commit(setUp())).rejects.toMatchObject({ code: 'RECOVERY' })
    await store.startFresh()
    expect(store.meta.recoveryNeeded).toBe(false)
  })

  it('opens a newer-schema file read-only and never overwrites it', async () => {
    const newer = JSON.stringify({ ...setUp(), schemaVersion: SCHEMA_VERSION + 1 })
    await fs.writeFile(join(dir, 'data.json'), newer)
    const store = new Store(dir)
    await store.load()
    expect(store.meta.readOnly).toBe(true)
    await expect(store.commit(setUp())).rejects.toMatchObject({ code: 'READ_ONLY' })
    expect(await fs.readFile(join(dir, 'data.json'), 'utf8')).toBe(newer)
  })

  it('loads a file with future-dated items (clock set backwards, QA B7)', async () => {
    const s = setUp()
    s.transactions.push({ id: randomUUID(), date: '2099-01-01', amount: 100, kind: 'daily', categoryId: s.categories[0]!.id, createdAt: '2026-10-13T00:00:00Z' })
    await fs.writeFile(join(dir, 'data.json'), JSON.stringify(s))
    const store = new Store(dir)
    await store.load()
    expect(store.meta.restoredFromBackup).toBe(false)
    expect(store.state.transactions).toHaveLength(1)
  })

  it('runs migrations with a pre-migration backup and re-save (QA N5)', async () => {
    const v0 = { ...setUp(), schemaVersion: 0 } as Record<string, unknown>
    delete (v0 as { confirmedDays?: unknown }).confirmedDays
    await fs.writeFile(join(dir, 'data.json'), JSON.stringify(v0))
    const store = new Store(dir, {
      now: at('2026-10-13T10:15:00'),
      migrations: { 0: (raw) => ({ ...raw, confirmedDays: [] }) }
    })
    await store.load()
    expect(store.state.confirmedDays).toEqual([])
    expect(await fs.readdir(store.backupsDir)).toContain('pre-migration-20261013T101500.json')
    expect(JSON.parse(await fs.readFile(store.dataFile, 'utf8')).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('export in read-only mode copies the untouched file; recovery mode refuses (QA N2)', async () => {
    const newer = JSON.stringify({ ...setUp(), schemaVersion: SCHEMA_VERSION + 1 })
    await fs.writeFile(join(dir, 'data.json'), newer)
    const store = new Store(dir)
    await store.load()
    const out = join(dir, 'export.json')
    await store.exportTo(out)
    expect(await fs.readFile(out, 'utf8')).toBe(newer)

    await fs.writeFile(join(dir, 'data.json'), 'garbage')
    await fs.rm(store.backupsDir, { recursive: true, force: true })
    const broken = new Store(dir)
    await broken.load()
    await expect(broken.exportTo(out)).rejects.toMatchObject({ code: 'RECOVERY' })
  })

  it('import rejects malformed, oversized and hostile files (T2)', async () => {
    const store = new Store(dir)
    await store.load()
    const write = async (name: string, body: string) => {
      const p = join(dir, name)
      await fs.writeFile(p, body)
      return p
    }
    await expect(store.readStateFile(await write('a.json', 'nope'))).rejects.toMatchObject({ code: 'INVALID_FILE' })
    await expect(store.readStateFile(await write('b.json', JSON.stringify({ ...setUp(), extra: 1 })))).rejects.toMatchObject({ code: 'INVALID_FILE' })
    await expect(store.readStateFile(await write('c.json', '{"__proto__":{"x":1},"schemaVersion":1}'))).rejects.toMatchObject({ code: 'INVALID_FILE' })
    const big = join(dir, 'big.json')
    await fs.writeFile(big, Buffer.alloc(50 * 1024 * 1024 + 1, 32))
    await expect(store.readStateFile(big)).rejects.toMatchObject({ code: 'TOO_LARGE' })
    const ok = await store.readStateFile(await write('ok.json', JSON.stringify(setUp())))
    expect(ok.settings.setupComplete).toBe(true)
  })

  it('replaceAll writes a pre-import backup; restore names are allowlisted', async () => {
    const store = new Store(dir, { now: at('2026-10-13T10:15:00') })
    await store.load()
    await store.commit(setUp())
    await store.replaceAll(setUp(), 'import')
    const names = await fs.readdir(store.backupsDir)
    expect(names).toContain('pre-import-20261013T101500.json')
    expect(names.every((n) => BACKUP_NAME_RE.test(n))).toBe(true)
    await expect(store.readBackup('../data.json')).rejects.toMatchObject({ code: 'BAD_NAME' })
    await expect(store.readBackup('pre-import-20261013T101500.json')).resolves.toBeTruthy()
  })
})
