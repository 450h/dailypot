/**
 * Captures README screenshots with demo data, light and dark. Not part of CI.
 * Run: npm run screenshots  → docs/screenshots/*.png
 * Every page "goes to print" for ≈ 1.2s after it mounts (docs/09 §7), so each shot waits ≥ 1.5s.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { addDays, todayLocal } from '../../src/shared/dates'
import type { AppState } from '../../src/shared/schema'
import { launch } from '../e2e/launch'
import { demoState } from './demo-data'

const out = resolve(__dirname, '../../docs/screenshots')
mkdirSync(out, { recursive: true })

/** The choreography settles by ≈ 1.2s (docs/09 §7.2); shots wait a little longer. */
const SETTLE_MS = 1600

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
  await page.mouse.move(4, 4) // park the pointer so no chart shows a hover tooltip
  await page.waitForTimeout(SETTLE_MS) // figures count up, charts draw, rows rise
}

async function launchWith(state: AppState): Promise<{ app: ElectronApplication; page: Page }> {
  const dir = mkdtempSync(join(tmpdir(), 'dailypot-showcase-'))
  writeFileSync(join(dir, 'data.json'), JSON.stringify(state))
  const { app, page } = await launch(dir)
  await prepare(app, page)
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  return { app, page }
}

/**
 * docs/screenshots lives in a OneDrive folder; the sync engine can hold a pinned file for a moment, which Node reports as
 * UNKNOWN/EBUSY/EPERM. Capture to a buffer first, then write with a short retry, so a retry never re-captures a page
 * whose animation state has moved on.
 */
async function save(name: string, buf: Buffer): Promise<void> {
  const path = join(out, `${name}.png`)
  for (let attempt = 1; ; attempt++) {
    try {
      writeFileSync(path, buf)
      return
    } catch (e) {
      if (attempt >= 3 || !/UNKNOWN|EBUSY|EPERM|EACCES/.test(String(e))) throw e
      await sleep(500 * attempt)
    }
  }
}

const card = (page: Page, title: string) => page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) })
const shot = async (page: Page, name: string): Promise<void> => save(name, await page.screenshot())
const cardShot = async (page: Page, title: string, name: string): Promise<void> => save(name, await card(page, title).screenshot())

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
    await page.waitForTimeout(SETTLE_MS)
    await shot(page, 'setup')
  } finally {
    await app.close()
  }
})

test('tour with demo data', async () => {
  const { app, page } = await launchWith(demoState())
  try {
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
    await page.mouse.move(4, 4) // keep hover tooltips out of the chart crops
    await cardShot(page, 'Daily spending vs per-day', 'chart-daily')
    await cardShot(page, 'Pot balance over time', 'chart-pot')
    await cardShot(page, 'Cycle over cycle', 'chart-cycles')
    await go(page, 'Settings')
    await shot(page, 'settings')

    // Dark theme.
    await page.evaluate(() => window.dailypot.updateSettings({ theme: 'dark' }))
    await page.reload()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await page.waitForTimeout(SETTLE_MS)
    await shot(page, 'dashboard-dark')
    await go(page, 'Reports')
    await shot(page, 'reports-dark')
  } finally {
    await app.close()
  }
})

test('dashboard with unlogged days, then the pay-bill dialog', async () => {
  // The demo data logs or confirms every closed day; forget two recent days so the "Unlogged days" widget renders.
  const today = todayLocal()
  const forgotten = new Set([addDays(today, -1), addDays(today, -2)])
  const s = demoState(today)
  s.transactions = s.transactions.filter((t) => t.kind === 'income' || !forgotten.has(t.date))
  s.confirmedDays = s.confirmedDays.filter((c) => !forgotten.has(c.date))
  // It also pays every bill due so far; leave the latest Internet month unpaid so the ledger offers "Mark paid".
  const internet = s.obligations.find((o) => o.name === 'Internet')!
  const latest = s.obligationPayments.filter((p) => p.obligationId === internet.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  s.obligationPayments = s.obligationPayments.filter((p) => p !== latest)
  const { app, page } = await launchWith(s)
  try {
    await expect(page.getByRole('heading', { name: 'Unlogged days' })).toBeVisible()
    // The widget sits below the fold (after the bills ledger); `toBeVisible` does not mean "in the viewport".
    await page.locator('.unlogged-widget').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300) // let the scroll land; the rows already rose on mount (.row-anim is time-based)
    await shot(page, 'dashboard-unlogged')

    // Pay-bill dialog from the bills ledger.
    await page.getByRole('button', { name: 'Mark paid' }).first().click()
    await page.waitForTimeout(800)
    await shot(page, 'pay-bill')
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})
