/**
 * Captures README screenshots with demo data, light and dark. Not part of CI.
 * Run: npm run screenshots  → docs/screenshots/*.png
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from '../e2e/launch'
import { demoState } from './demo-data'

const out = resolve(__dirname, '../../docs/screenshots')
mkdirSync(out, { recursive: true })

async function prepare(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.setContentSize(1440, 900)
    w.center()
  })
  await page.waitForTimeout(400)
}

async function go(page: Page, nav: string): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: nav, exact: true }).click()
  await page.locator('.main').evaluate((el) => el.scrollTo(0, 0))
  await page.waitForTimeout(700) // charts animate in
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) })
const card = (page: Page, title: string) => page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) })

test('setup wizard', async () => {
  const { app, page } = await launch()
  try {
    await prepare(app, page)
    await page.getByLabel('Payday').fill('27')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    const rows = [
      ['Phone', '80', '5'],
      ['Gym', '150', '15']
    ]
    for (const [i, [n, a, d]] of rows.entries()) {
      if (i > 0) await page.getByRole('button', { name: 'Add bill' }).click()
      await page.getByPlaceholder('Phone').nth(i).fill(n!)
      await page.getByPlaceholder('80').nth(i).fill(a!)
      await page.getByPlaceholder('5').nth(i).fill(d!)
    }
    await shot(page, 'setup')
  } finally {
    await app.close()
  }
})

test('tour with demo data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dailypot-showcase-'))
  writeFileSync(join(dir, 'data.json'), JSON.stringify(demoState()))
  const { app, page } = await launch(dir)
  try {
    await prepare(app, page)
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'dashboard')

    await go(page, 'Pot history')
    await shot(page, 'pot-history')
    await go(page, 'Transactions')
    await shot(page, 'transactions')
    await go(page, 'Bills')
    await shot(page, 'bills')
    await go(page, 'Savings goals')
    await shot(page, 'goals')
    await go(page, 'Investments')
    await shot(page, 'investments')
    await go(page, 'Reports')
    await shot(page, 'reports')
    await card(page, 'Daily spending vs per-day').screenshot({ path: join(out, 'chart-daily.png') })
    await card(page, 'Pot balance over time').screenshot({ path: join(out, 'chart-pot.png') })
    await card(page, 'Cycle over cycle').screenshot({ path: join(out, 'chart-cycles.png') })

    // Pay-bill dialog on the dashboard.
    await go(page, 'Dashboard')
    const payBtn = page.getByRole('button', { name: 'Mark paid' }).first()
    if (await payBtn.isVisible()) {
      await payBtn.click()
      await page.waitForTimeout(300)
      await shot(page, 'pay-bill')
      await page.keyboard.press('Escape')
    }

    // Dark theme.
    await page.evaluate(() => window.dailypot.updateSettings({ theme: 'dark' }))
    await page.reload()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'dashboard-dark')
    await go(page, 'Reports')
    await shot(page, 'reports-dark')
  } finally {
    await app.close()
  }
})
