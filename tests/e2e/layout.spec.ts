/**
 * Layout guard for the folding ledger (docs/09 §4.12, §5.5): nothing in the app may ever produce a horizontal scrollbar.
 * With demo data, every nav page is visited at the three reference content sizes (900×640 minimum, 1200×820, 1440×900);
 * after the choreography has settled, the document, `.main` and every `.table-wrap`, `.table`, `.card`, `.widget` and
 * `.modal` must fit their own width, with every chart's "Show table" view open and the Bills history dialog open. A second
 * state (two unlogged days + one unpaid bill, as in the showcase) checks the span-8 bills ledger and the Pay dialog.
 *
 * The host screen clamps real window sizes (a 768px-tall laptop or a CI runner cannot show 1440×900), so the layout
 * viewport is emulated instead: the window is sized as far as the screen allows, then a CDP `Emulation.setDeviceMetricsOverride`
 * fixes `innerWidth × innerHeight` (and so every media and container query) at the target. The achieved size is read back
 * and written into every assertion label; it is never hard-asserted, so a runner that cannot emulate still reports what it checked.
 */
import { expect, test, type CDPSession, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addDays, todayLocal } from '../../src/shared/dates'
import type { AppState } from '../../src/shared/schema'
import { demoState } from '../showcase/demo-data'
import { launch } from './launch'

const SIZES: ReadonlyArray<readonly [number, number]> = [
  [900, 640],
  [1200, 820],
  [1440, 900]
]
const PAGES = ['Dashboard', 'Transactions', 'Bills', 'Pot history', 'Savings goals', 'Investments', 'Reports', 'Settings'] as const
/** The choreography settles by ≈ 1.2s (docs/09 §7.2); counts lock their width while running, so wait it out. */
const SETTLE_MS = 1700
const CHECKED = ['.table-wrap', '.table', '.card', '.widget', '.modal'] as const

interface Session {
  app: ElectronApplication
  page: Page
  /** Kept open for the whole test: Chromium drops an emulation override when the session that set it detaches. */
  cdp: CDPSession
}

async function launchWith(state: AppState): Promise<Session> {
  const dir = mkdtempSync(join(tmpdir(), 'dailypot-layout-'))
  writeFileSync(join(dir, 'data.json'), JSON.stringify(state))
  const { app, page } = await launch(dir)
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  return { app, page, cdp }
}

/** Sizes the window (best effort), emulates the target viewport and returns the size the renderer actually reports. */
async function setViewport({ app, page, cdp }: Session, [w, h]: readonly [number, number]): Promise<string> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]!
    win.setContentSize(size.w, size.h)
    win.center()
  }, { w, h })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false })
  await page.waitForTimeout(400)
  const got = await page.evaluate(() => `${window.innerWidth}×${window.innerHeight}`)
  const want = `${w}×${h}`
  if (got !== want) test.info().annotations.push({ type: 'viewport', description: `asked for ${want}, renderer reports ${got}` })
  return got === want ? want : `${want} (renderer reports ${got})`
}

async function go(page: Page, nav: string): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: nav, exact: true }).click()
  await page.locator('.main').evaluate((el) => el.scrollTo(0, 0))
  await page.mouse.move(4, 4)
  await page.waitForTimeout(SETTLE_MS)
}

/** Every offender as `selector[index] scrollWidth > clientWidth`; empty when the layout fits. */
async function offenders(page: Page): Promise<string[]> {
  return page.evaluate((selectors) => {
    const bad: string[] = []
    const de = document.documentElement
    if (de.scrollWidth > window.innerWidth) bad.push(`html ${de.scrollWidth} > innerWidth ${window.innerWidth}`)
    const main = document.querySelector<HTMLElement>('.main')
    if (main && main.scrollWidth > main.clientWidth) bad.push(`.main ${main.scrollWidth} > ${main.clientWidth}`)
    for (const sel of selectors) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 1) bad.push(`${sel}[${i}] ${el.scrollWidth} > ${el.clientWidth}`)
      })
    }
    return bad
  }, CHECKED)
}

async function assertFits(page: Page, where: string): Promise<void> {
  expect(await offenders(page), where).toEqual([])
}

/** Open every chart's table view (each toggle reads "Show chart" once clicked, so the first "Show table" moves on). */
async function showTables(page: Page): Promise<void> {
  const toggles = page.getByRole('button', { name: 'Show table', exact: true })
  for (let n = await toggles.count(); n > 0; n--) await toggles.first().click()
  await page.waitForTimeout(150)
}

async function withDialog(page: Page, opener: string, check: () => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: opener, exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(300) // modal-in has played
  await check()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('no horizontal overflow on any page at 900, 1200 and 1440 wide (demo data)', async () => {
  test.setTimeout(90_000)
  const session = await launchWith(demoState())
  const { app, page } = session
  try {
    for (const size of SIZES) {
      const at = await setViewport(session, size)
      for (const name of PAGES) {
        await go(page, name)
        await assertFits(page, `${name} @ ${at}`)
        if (name === 'Dashboard' || name === 'Reports') {
          await showTables(page)
          await assertFits(page, `${name} (tables shown) @ ${at}`)
        }
        if (name === 'Bills') {
          await withDialog(page, 'History', async () => {
            expect(await page.locator('.modal .table').count(), `Bills history dialog has a table @ ${at}`).toBe(1)
            await assertFits(page, `Bills history dialog @ ${at}`)
          })
        }
      }
    }
  } finally {
    await app.close()
  }
})

test('dashboard with unlogged days and an unpaid bill fits at every size, pay dialog included', async () => {
  // As in the showcase: forget two recent days and leave the latest Internet month unpaid, so the bills ledger sits at
  // span 8 beside the unlogged-days widget and offers "Mark paid".
  const today = todayLocal()
  const forgotten = new Set([addDays(today, -1), addDays(today, -2)])
  const s = demoState(today)
  s.transactions = s.transactions.filter((t) => t.kind === 'income' || !forgotten.has(t.date))
  s.confirmedDays = s.confirmedDays.filter((c) => !forgotten.has(c.date))
  const internet = s.obligations.find((o) => o.name === 'Internet')!
  const latest = s.obligationPayments.filter((p) => p.obligationId === internet.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  s.obligationPayments = s.obligationPayments.filter((p) => p !== latest)

  const session = await launchWith(s)
  const { app, page } = session
  try {
    await expect(page.getByRole('heading', { name: 'Unlogged days' })).toBeVisible()
    for (const size of SIZES) {
      const at = await setViewport(session, size)
      await go(page, 'Dashboard') // remounts the page, so the choreography replays at this size
      await assertFits(page, `Dashboard (unlogged) @ ${at}`)
      await withDialog(page, 'Mark paid', async () => assertFits(page, `Pay dialog @ ${at}`))
    }
  } finally {
    await app.close()
  }
})
