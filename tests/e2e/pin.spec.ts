import { expect, test } from '@playwright/test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './launch'

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('PIN: lock on start, wrong PIN backs off, correct PIN unlocks; locked + corrupt data goes lock → recovery (QA B13)', async () => {
  const first = await launch()
  try {
    const r = await first.page.evaluate(
      (today) =>
        window.dailypot.completeSetup({ currency: 'SAR', payday: 27, dailyAllowance: 7000, firstCycleStart: today, obligations: [], pin: '246810' }),
      iso(new Date())
    )
    expect(r.ok).toBe(true)
  } finally {
    await first.app.close()
  }

  // Relaunch: locked, data is not exposed.
  const second = await launch(first.dataDir)
  try {
    const { page } = second
    await expect(page.getByRole('heading', { name: 'DailyPot is locked' })).toBeVisible()
    const leaked = await page.evaluate(() => window.dailypot.getState())
    expect(leaked.ok && leaked.data.state.cycles.length).toBe(0)
    const refused = await page.evaluate(() => window.dailypot.updateSettings({ payday: 1 }))
    expect(refused.ok).toBe(false)

    await page.getByLabel('PIN').fill('111111')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByText('Wrong PIN')).toBeVisible()
    await expect(page.getByText(/Try again in \ds/)).toBeVisible()
    await page.waitForTimeout(1200)
    await page.getByLabel('PIN').fill('246810')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
  } finally {
    await second.app.close()
  }

  // Corrupt data.json with no valid backup, PIN still set → lock screen first, then recovery.
  writeFileSync(join(first.dataDir, 'data.json'), '{ broken')
  rmSync(join(first.dataDir, 'backups'), { recursive: true, force: true })
  const third = await launch(first.dataDir)
  try {
    const { page } = third
    await expect(page.getByRole('heading', { name: 'DailyPot is locked' })).toBeVisible()
    await page.getByLabel('PIN').fill('246810')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('heading', { name: 'Your data file couldn’t be read' })).toBeVisible()
    await page.getByRole('button', { name: 'Start fresh' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Start fresh' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to DailyPot' })).toBeVisible()
  } finally {
    await third.app.close()
  }
})
