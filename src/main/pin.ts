/**
 * Optional PIN lock (docs/06 F10, SECURITY §3). A privacy screen, not encryption.
 * security.json is read only by main; nothing here is ever sent to the renderer.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { zPin } from '@shared/ipc'

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 }
const MAX_BACKOFF_MS = 30_000

function scrypt(pin: string, salt: Buffer, opts: { N: number; r: number; p: number; keylen: number }): Promise<Buffer> {
  const options: ScryptOptions = { N: opts.N, r: opts.r, p: opts.p, maxmem: 256 * opts.N * opts.r }
  return new Promise((res, rej) => scryptCb(pin, salt, opts.keylen, options, (e, key) => (e ? rej(e) : res(key))))
}

interface SecurityFile {
  pinHash: string
  pinSalt: string
  N: number
  r: number
  p: number
  keylen: number
}

export class PinError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class PinLock {
  private record: SecurityFile | null = null
  private failures = 0
  private verifying = false
  private nextAttemptAt = 0
  locked = false
  private readonly file: string

  constructor(
    dir: string,
    private readonly now: () => number = Date.now
  ) {
    this.file = join(dir, 'security.json')
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<SecurityFile>
      const ok =
        typeof raw.pinHash === 'string' &&
        typeof raw.pinSalt === 'string' &&
        [raw.N, raw.r, raw.p, raw.keylen].every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)
      this.record = ok ? (raw as SecurityFile) : null
    } catch {
      this.record = null
    }
    this.locked = this.record !== null
  }

  get pinSet(): boolean {
    return this.record !== null
  }

  status(): { pinSet: boolean; locked: boolean; retryAfterMs: number } {
    return { pinSet: this.pinSet, locked: this.locked, retryAfterMs: Math.max(0, this.nextAttemptAt - this.now()) }
  }

  lock(): void {
    if (this.pinSet) this.locked = true
  }

  /** Verifies with exponential backoff (1s, 2s, 4s … 30s), enforced here in main. */
  async verify(pin: unknown): Promise<boolean> {
    if (!this.record) {
      this.locked = false
      return true
    }
    if (this.verifying) throw new PinError('BUSY', 'Already checking a PIN')
    if (this.now() < this.nextAttemptAt) throw new PinError('BACKOFF', 'Too many attempts; wait a moment')
    this.verifying = true
    let ok: boolean
    try {
      ok = zPin.safeParse(pin).success && (await this.matches(pin as string))
    } finally {
      this.verifying = false
    }
    if (ok) {
      this.failures = 0
      this.nextAttemptAt = 0
      this.locked = false
      return true
    }
    this.failures++
    this.nextAttemptAt = this.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1))
    return false
  }

  async set(current: unknown, next: unknown): Promise<void> {
    if (this.record && !(await this.verify(current))) throw new PinError('WRONG_PIN', 'Current PIN is wrong')
    const parsed = zPin.safeParse(next)
    if (!parsed.success) throw new PinError('INVALID', 'PIN must be 4–8 digits')
    const salt = randomBytes(16)
    const key = await scrypt(parsed.data, salt, SCRYPT)
    const rec: SecurityFile = { pinHash: key.toString('base64'), pinSalt: salt.toString('base64'), ...SCRYPT }
    await fs.writeFile(`${this.file}.tmp`, JSON.stringify(rec), 'utf8')
    await fs.rename(`${this.file}.tmp`, this.file)
    this.record = rec
    this.locked = false
  }

  async clear(current: unknown): Promise<void> {
    if (!this.record) return
    if (!(await this.verify(current))) throw new PinError('WRONG_PIN', 'Current PIN is wrong')
    await fs.rm(this.file, { force: true })
    this.record = null
    this.locked = false
  }

  private async matches(pin: string): Promise<boolean> {
    const rec = this.record!
    const expected = Buffer.from(rec.pinHash, 'base64')
    const actual = await scrypt(pin, Buffer.from(rec.pinSalt, 'base64'), rec)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
