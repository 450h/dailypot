import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transactionsCsv, textCell } from './csv'
import { PinLock } from './pin'
import { Service, type Platform } from './service'
import { Store } from './store'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'dailypot-svc-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const platform = (over: Partial<Platform> = {}): Platform => ({
  version: '0.0.0-test',
  saveDialog: async () => null,
  openDialog: async () => null,
  confirm: async () => true,
  openFolder: async () => undefined,
  openRepo: async () => undefined,
  ...over
})

async function make(nowMs = { v: Date.parse('2026-10-13T10:00:00') }) {
  const store = new Store(dir, { now: () => new Date(nowMs.v) })
  await store.load()
  const pin = new PinLock(dir, () => nowMs.v)
  await pin.load()
  const svc = new Service(store, pin, platform(), () => new Date(nowMs.v))
  return { store, pin, svc, nowMs }
}

const setup = { currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: '2026-10-13', obligations: [] }

describe('Service lock enforcement (SECURITY §1)', () => {
  it('refuses data commands while locked and redacts state', async () => {
    const { svc, pin } = await make()
    await svc.completeSetup({ ...setup, pin: '123456' })
    pin.lock()
    await expect(svc.upsert('goals', {})).rejects.toMatchObject({ code: 'LOCKED' })
    await expect(svc.updateSettings({ payday: 1 })).rejects.toMatchObject({ code: 'LOCKED' })
    await expect(svc.backupList()).rejects.toMatchObject({ code: 'LOCKED' })
    await expect(svc.dataExport()).rejects.toMatchObject({ code: 'LOCKED' })
    await expect(svc.recoveryStartFresh()).rejects.toMatchObject({ code: 'LOCKED' })
    const p = svc.getState()
    expect(p.meta.locked).toBe(true)
    expect(p.state.cycles).toHaveLength(0)
    expect(p.state.categories).toHaveLength(0)
  })
})

describe('concurrency (QA B10)', () => {
  it('two upserts fired without awaiting both persist', async () => {
    const { svc, store } = await make()
    await svc.completeSetup(setup)
    const cat = store.state.categories.find((c) => c.kind === 'expense')!.id
    const tx = (amount: number) => ({ id: crypto.randomUUID(), date: '2026-10-13', amount, kind: 'daily', categoryId: cat })
    await Promise.all([svc.upsert('transactions', tx(100)), svc.upsert('transactions', tx(200)), svc.rollCycles(), svc.upsert('transactions', tx(300))])
    expect(store.state.transactions.map((t) => t.amount).sort()).toEqual([100, 200, 300])
    const onDisk = JSON.parse(await fs.readFile(join(dir, 'data.json'), 'utf8'))
    expect(onDisk.transactions).toHaveLength(3)
  })
})

describe('PIN (F10)', () => {
  it('allows only one verification at a time (no parallel guessing)', async () => {
    const { svc, pin } = await make()
    await svc.completeSetup({ ...setup, pin: '123456' })
    pin.lock()
    const results = await Promise.allSettled([svc.pinVerify('000001'), svc.pinVerify('000002'), svc.pinVerify('000003')])
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2)
  })

  it('hashes, verifies, and backs off exponentially in main', async () => {
    const { svc, pin, nowMs } = await make()
    await svc.completeSetup({ ...setup, pin: '123456' })
    const raw = await fs.readFile(join(dir, 'security.json'), 'utf8')
    expect(raw).not.toContain('123456')
    pin.lock()
    expect((await svc.pinVerify('000000')).locked).toBe(true)
    expect(svc.pinStatus().retryAfterMs).toBe(1000)
    await expect(svc.pinVerify('123456')).rejects.toMatchObject({ code: 'BACKOFF' })
    nowMs.v += 1000
    expect((await svc.pinVerify('111111')).retryAfterMs).toBe(2000)
    nowMs.v += 2000
    expect((await svc.pinVerify('123456')).locked).toBe(false)
  })

  it('change requires the current PIN; clear removes security.json', async () => {
    const { svc, nowMs } = await make()
    await svc.completeSetup({ ...setup, pin: '1234' })
    await expect(svc.pinSet('9999', '5678')).rejects.toMatchObject({ code: 'WRONG_PIN' })
    nowMs.v += 1000
    await expect(svc.pinSet('1234', '12')).rejects.toMatchObject({ code: 'INVALID' })
    await svc.pinClear('1234')
    await expect(fs.access(join(dir, 'security.json'))).rejects.toThrow()
    expect(svc.pinStatus().pinSet).toBe(false)
  })
})

describe('CSV export (T12)', () => {
  it('neutralises formulas in text, keeps amounts numeric, adds BOM', async () => {
    const { svc, store } = await make()
    await svc.completeSetup(setup)
    const cat = store.state.categories.find((c) => c.kind === 'expense')!.id
    await svc.upsert('transactions', { id: crypto.randomUUID(), date: '2026-10-13', amount: 1050, kind: 'daily', categoryId: cat, note: '=HYPERLINK("x")' })
    const csv = transactionsCsv(store.state)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain(',10.50,')
    expect(textCell('-50')).toBe(`"'-50"`)
  })
})

describe('import/export round trip (restore drill C5)', () => {
  it('export then import into a fresh data dir gives identical data', async () => {
    const out = join(dir, 'export.json')
    const a = await make()
    a.svc = new Service(a.store, a.pin, platform({ saveDialog: async () => out }), () => new Date(a.nowMs.v))
    await a.svc.completeSetup(setup)
    await a.svc.dataExport()
    const exported = JSON.parse(await fs.readFile(out, 'utf8'))

    const dir2 = await fs.mkdtemp(join(tmpdir(), 'dailypot-fresh-'))
    const store2 = new Store(dir2)
    await store2.load()
    const pin2 = new PinLock(dir2)
    await pin2.load()
    const svc2 = new Service(store2, pin2, platform({ openDialog: async () => out }), () => new Date(a.nowMs.v))
    await svc2.dataImport()
    expect(store2.state.cycles).toEqual(exported.cycles)
    expect(store2.state.categories).toEqual(exported.categories)
    await fs.rm(dir2, { recursive: true, force: true })
  })
})
