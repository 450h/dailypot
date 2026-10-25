import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { addDays, formatDate, parts, todayLocal } from '../../src/shared/dates'
import { launch } from './launch'

const shots = join(__dirname, 'screenshots')
mkdirSync(shots, { recursive: true })

/** The `.card` whose stat label is exactly `label`. Its `.stat-value` counts up for about a second after the page appears, so only auto-retrying matchers may read it (docs/09 §9.6). */
const statCard = (page: Page, label: string): Locator => page.locator('.card', { has: page.getByText(label, { exact: true }) })
const potValue = (page: Page): Locator => statCard(page, 'Side pot').locator('.stat-value')
const nav = (page: Page, name: string): Locator => page.getByRole('navigation').getByRole('button', { name, exact: true })

/** F1: the setup wizard with payday 27, tracking from `start`, per-day 70.00 and one 80.00 bill due on `dueDay`. */
async function setupWizard(page: Page, start: string, dueDay: number, shot?: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Welcome to DailyPot' })).toBeVisible()
  await page.getByLabel('Payday').fill('27')
  await page.getByLabel('Start tracking from').fill(start)
  await expect(page.getByText('past day(s) with no entries')).toBeVisible()
  if (shot) await page.screenshot({ path: join(shots, shot) })
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Per-day (SAR)')).toHaveValue('70.00')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Name').fill('Phone')
  await page.getByLabel('Amount').fill('80')
  await page.getByLabel('Due day').fill(String(dueDay))
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Start using DailyPot' }).click()
}

test('setup → expense → pay bill → relaunch keeps the figures (docs/08 P2)', async () => {
  const today = todayLocal()
  const start = addDays(today, -3)

  const { app, page, dataDir } = await launch()
  try {
    await setupWizard(page, start, parts(today).d, '01-setup.png')

    // F2 dashboard: 3 closed days × 70 = 210 in the pot
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await expect(potValue(page)).toHaveText('210.00 SAR')

    // Day Strip cells are real targets at the default window (docs/09 §6.3, §9.1: ≥ 24px pitch, WCAG 2.5.8).
    const cells = page.locator('.ribbon .strip-cell')
    await expect(cells.first()).toBeVisible()
    const boxes = await cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width, h: r.height })))
    expect(boxes.length).toBeGreaterThan(1)
    for (const b of boxes) {
      expect(b.w).toBeGreaterThanOrEqual(20)
      expect(b.h).toBeGreaterThanOrEqual(24)
    }
    expect(boxes[1]!.x - boxes[0]!.x).toBeGreaterThanOrEqual(24)

    // Keyboard focus is visible on an unlogged cell (the one that opens a popover) and on a chart (docs/09 §9.1).
    const unloggedCell = page.locator('.ribbon .strip-cell.unlogged').first()
    if ((await unloggedCell.count()) > 0) {
      await page.keyboard.press('Shift') // a keyboard interaction, so a scripted focus() counts as :focus-visible
      await unloggedCell.focus()
      await expect(unloggedCell).toHaveCSS('outline-style', 'solid')
      await expect(unloggedCell).toHaveCSS('outline-width', '2px')
      await expect(unloggedCell).not.toHaveCSS('box-shadow', 'none')
    }
    const chart = page.locator('.recharts-surface').first()
    await page.keyboard.press('Shift')
    await chart.focus()
    await expect(chart).toHaveCSS('outline-style', 'solid')
    await expect(chart).toHaveCSS('outline-width', '2px')

    // Unlogged days are confirmable from the dashboard widget and from Pot history (docs/09 §1 complaint 1; 05 §5).
    const widget = page.locator('.unlogged-widget')
    await expect(widget.getByRole('heading', { name: /^Unlogged days/ })).toBeVisible()
    const spentNothing = widget.getByRole('button', { name: 'Spent nothing' })
    await expect(spentNothing).toHaveCount(3)
    await spentNothing.first().focus() // newest first: yesterday; confirmed with the keyboard
    await page.keyboard.press('Enter')
    await expect(page.getByText('Day confirmed')).toBeVisible()
    await expect(spentNothing).toHaveCount(2)
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY') // focus kept its place
    await expect(potValue(page)).toHaveText('210.00 SAR') // confirming never moves the pot

    // Clicking a closed cell on the dashboard strip opens Pot history on that day's row (docs/09 §6.3).
    const confirmedCell = page.locator('.ribbon .strip-cell.confirmed').first()
    if ((await confirmedCell.count()) > 0) {
      const date = await confirmedCell.getAttribute('data-date')
      await confirmedCell.click()
      await expect(page.getByRole('heading', { name: 'Pot history' })).toBeVisible()
      await expect(page.locator('tr.hx-hit')).toHaveAttribute('data-date', date ?? '', { timeout: 2500 })
      await nav(page, 'Dashboard').click()
      await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    }

    // Pot history scopes "Confirm all" to the selected (current) cycle. With payday 27 the three closed days straddle a
    // cycle boundary when today is the 27th–29th, so count how many of the two remaining days the current cycle holds.
    const st = await page.evaluate(() => window.dailypot.getState())
    const current = st.ok ? st.data.state.cycles.find((c) => c.startDate <= today && today <= c.endDate) : undefined
    const remaining = [addDays(today, -3), addDays(today, -2)].filter((d) => current !== undefined && d >= current.startDate).length
    await nav(page, 'Pot history').click()
    await expect(page.getByRole('heading', { name: 'Pot history' })).toBeVisible()
    const confirmAll = page.getByRole('button', { name: 'Confirm all unlogged in this cycle' })
    if (remaining > 0) {
      await confirmAll.click()
      await expect(page.getByText(`${remaining} day${remaining === 1 ? '' : 's'} confirmed as spent nothing`)).toBeVisible()
    } else {
      await expect(confirmAll).toHaveCount(0)
    }
    await expect(page.locator('.tile', { has: page.getByText('Unlogged days', { exact: true }) }).locator('.stat-value')).toHaveText('0')
    const after = await page.evaluate(() => window.dailypot.getState())
    expect(after.ok && after.data.state.confirmedDays.length).toBe(1 + remaining)
    await nav(page, 'Dashboard').click()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()

    // Quick add (keyboard: Enter submits)
    const amount = page.locator('form').getByLabel('Amount (SAR)')
    await amount.fill('25')
    await amount.press('Enter')
    await expect(statCard(page, 'Left to spend today').locator('.stat-value')).toContainText('45.00')

    // Pay the phone bill (due today) — fully from the pot
    const row = page.locator('tr', { has: page.getByText('Phone', { exact: true }) })
    await expect(row.getByText('Due today')).toBeVisible()
    await row.getByRole('button', { name: 'Mark paid' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Amount (SAR)')).toBeFocused()
    // The dialog traps focus (docs/09 §9.2): Tab from the last button wraps to the first field, Shift+Tab wraps back.
    await dialog.getByRole('button', { name: 'Mark paid' }).focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Mark paid' })).toBeFocused()
    expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(true)
    // A re-render behind the dialog (a state push from main) must not yank focus back to the first field.
    await dialog.getByLabel('Paid on').focus()
    await page.evaluate((d) => window.dailypot.upsert('confirmedDays', { id: crypto.randomUUID(), date: d }), start)
    await page.waitForTimeout(300)
    await expect(dialog.getByLabel('Paid on')).toBeFocused()
    await dialog.getByRole('button', { name: 'Mark paid' }).click()
    await expect(page.getByText(/from pot 80\.00 SAR · from main balance 0\.00 SAR/)).toBeVisible()
    expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(false)
    await expect(potValue(page)).toHaveText('130.00 SAR')
    await page.waitForTimeout(5000) // let toasts clear before screenshots
    await page.screenshot({ path: join(shots, '02-dashboard.png'), fullPage: true })

    // Pot history shows the payment
    await nav(page, 'Pot history').click()
    await expect(page.locator('tr', { hasText: 'Phone' })).toContainText('80.00')
    await page.screenshot({ path: join(shots, '03-pot-history.png'), fullPage: true })

    for (const [name, file] of [
      ['Transactions', '04-transactions'],
      ['Bills', '05-bills'],
      ['Reports', '06-reports'],
      ['Settings', '07-settings']
    ] as const) {
      await nav(page, name).click()
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
    await expect(potValue(again.page)).toHaveText('130.00 SAR')
    const r = await again.page.evaluate(() => window.dailypot.getState())
    expect(r.ok && r.data.state.transactions.length).toBe(1)
    expect(r.ok && r.data.meta.today).toBe(today)
  } finally {
    await again.app.close()
  }
})

test('extend tracking back, then set the main balance (docs/05 §3, §10)', async () => {
  const today = todayLocal()
  const start = addDays(today, -3)
  const newStart = addDays(start, -10)

  const { app, page } = await launch()
  try {
    await setupWizard(page, start, parts(today).d)
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await expect(potValue(page)).toHaveText('210.00 SAR')
    // Unanchored: the masthead only shows the change since the first tracked day.
    await expect(page.locator('.masthead').getByText(`Change since ${formatDate(start)}`, { exact: true })).toBeVisible()

    // Pot history → "Extend tracking back": 10 days earlier at 70.00 per day, both options on.
    await nav(page, 'Pot history').click()
    await page.getByRole('button', { name: 'Extend tracking back' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('New start date').fill(newStart)
    await expect(dialog.getByLabel('Per-day for the added days (SAR)')).toHaveValue('70.00')
    await expect(dialog.getByLabel('Mark the added days as spent nothing')).toBeChecked()
    await expect(dialog.getByLabel('Mark past bill months as skipped')).toBeChecked()
    await expect(dialog.getByText(/^PREVIEW · 10 DAYS/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Extend tracking', exact: true }).click()
    await expect(page.getByText(`Tracking now starts on ${formatDate(newStart, true)}`)).toBeVisible()

    // Engine figures (checked against computePot over the same scenario for seven different dates): the ten added days
    // have no entries, so each puts the full 70.00 into the pot. The old first cycle therefore opens at 700.00 and the pot
    // now reads 210.00 + 700.00 = 910.00. The Phone bill is due on today's day of the month, so no bill month falls in the
    // added range and skipPastBills records nothing.
    const tile = (label: string): Locator => page.locator('.tile', { has: page.getByText(label, { exact: true }) })
    await expect(tile('Pot now').locator('.stat-value')).toHaveText('910.00 SAR')
    // The wrapping <label> gives the select the name "Cycle <selected option>", so match on the role and the prefix.
    const picker = page.getByRole('combobox', { name: /^Cycle\b/ })
    const firstTracked = picker.locator('option', { hasText: `${formatDate(start, true)} –` })
    await picker.selectOption((await firstTracked.getAttribute('value')) ?? '')
    await expect(tile('Opening pot').locator('.stat-value')).toHaveText('700.00 SAR')

    // Dashboard: the side pot grew by 10 × 70.00.
    await nav(page, 'Dashboard').click()
    await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
    await expect(potValue(page)).toHaveText('910.00 SAR')

    // Masthead: "My balance right now is 5000" anchors the live balance.
    const masthead = page.locator('.masthead')
    await masthead.getByRole('button', { name: 'Set your balance', exact: true }).click()
    const balance = page.getByRole('dialog')
    // Unanchored: the field starts empty and Save is disabled, because the derived figure is not a bank balance (docs/05 §10).
    await expect(balance.getByLabel('My balance right now is (SAR)')).toHaveValue('')
    await expect(balance.getByRole('button', { name: 'Save' })).toBeDisabled()
    await balance.getByLabel('My balance right now is (SAR)').fill('5000')
    await balance.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Balance set')).toBeVisible()
    await expect(masthead.getByText('Main balance', { exact: true })).toBeVisible()
    await expect(masthead.locator('.hero-value')).toHaveAttribute('data-settled', 'true')
    await expect(masthead.locator('.hero-value')).toContainText('5,000.00')
  } finally {
    await app.close()
  }
})
