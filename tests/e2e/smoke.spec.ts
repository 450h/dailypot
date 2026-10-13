import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './launch'

const shots = join(__dirname, 'screenshots')
mkdirSync(shots, { recursive: true })

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function potValue(page: Page): Promise<string> {
  const card = page.locator('.card', { has: page.getByText('Side pot', { exact: true }) })
  return (await card.locator('.stat-value').innerText()).replace(/\s+/g, ' ').trim()
}

test('setup → expense → pay bill → relaunch keeps the figures (docs/08 P2)', async () => {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 3)
  const today = iso(now)

  const { app, page, dataDir } = await launch()
  try {
    // F1 setup wizard
    await expect(page.getByRole('heading', { name: 'Welcome to DailyPot' })).toBeVisible()
    await page.getByLabel('Payday').fill('27')
    await page.getByLabel('Start tracking from').fill(iso(start))
    await expect(page.getByText('past day(s) with no entries')).toBeVisible()
    await page.screenshot({ path: join(shots, '01-setup.png') })
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Per-day (SAR)')).toHaveValue('70.00')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Name').fill('Phone')
    await page.getByLabel('Amount').fill('80')
    await page.getByLabel('Due day').fill(String(now.getDate()))
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Start using DailyPot' }).click()

    // F2 dashboard: 3 closed days × 70 = 210 in the pot
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    expect(await potValue(page)).toBe('210.00 SAR')

    // Quick add (keyboard: Enter submits)
    const amount = page.locator('form').getByLabel('Amount (SAR)')
    await amount.fill('25')
    await amount.press('Enter')
    const left = page.locator('.card', { has: page.getByText('Left to spend today', { exact: true }) })
    await expect(left.locator('.stat-value')).toContainText('45.00')

    // Pay the phone bill (due today) — fully from the pot
    const row = page.locator('tr', { has: page.getByText('Phone', { exact: true }) })
    await expect(row.getByText('Due today')).toBeVisible()
    await row.getByRole('button', { name: 'Mark paid' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mark paid' }).click()
    await expect(page.getByText(/from pot 80\.00 SAR · from main balance 0\.00 SAR/)).toBeVisible()
    expect(await potValue(page)).toBe('130.00 SAR')
    await page.waitForTimeout(5000) // let toasts clear before screenshots
    await page.screenshot({ path: join(shots, '02-dashboard.png'), fullPage: true })

    // Pot history shows the payment
    await page.getByRole('button', { name: 'Pot history' }).click()
    await expect(page.locator('tr', { hasText: 'Phone' })).toContainText('80.00')
    await page.screenshot({ path: join(shots, '03-pot-history.png'), fullPage: true })

    for (const [nav, file] of [
      ['Transactions', '04-transactions'],
      ['Bills', '05-bills'],
      ['Reports', '06-reports'],
      ['Settings', '07-settings']
    ] as const) {
      await page.getByRole('navigation').getByRole('button', { name: nav }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(shots, `${file}.png`), fullPage: true })
    }
  } finally {
    await app.close()
  }

  // Relaunch with the same data dir: nothing lost.
  const again = await launch(dataDir)
  try {
    await expect(again.page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    expect(await potValue(again.page)).toBe('130.00 SAR')
    const r = await again.page.evaluate(() => window.dailypot.getState())
    expect(r.ok && r.data.state.transactions.length).toBe(1)
    expect(r.ok && r.data.meta.today).toBe(today)
  } finally {
    await again.app.close()
  }
})
