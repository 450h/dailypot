import { expect, test } from '@playwright/test'
import { launch } from './launch'

test('window loads from app:// with the hardened bridge only', async () => {
  const { app, page, dataDir } = await launch()
  try {
    expect(page.url()).toMatch(/^app:\/\/dailypot\//)
    const env = await page.evaluate(() => ({
      hasBridge: typeof window.dailypot?.getState === 'function',
      hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
      hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined'
    }))
    expect(env).toEqual({ hasBridge: true, hasRequire: false, hasProcess: false })

    // Network is blocked (ADR-0005).
    const fetched = await page.evaluate(async () => {
      try {
        await fetch('https://example.com')
        return 'reached'
      } catch {
        return 'blocked'
      }
    })
    expect(fetched).toBe('blocked')

    // Data dir isolation works in unpackaged builds.
    const r = await page.evaluate(() => window.dailypot.getState())
    expect(r.ok && r.data.meta.dataPath).toBe(dataDir)

    // window.open is denied.
    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true)
  } finally {
    await app.close()
  }
})
