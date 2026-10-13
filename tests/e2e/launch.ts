import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Launches the built, unpackaged app (out/) with an isolated data dir (docs/08 testing strategy). */
export async function launch(dataDir = mkdtempSync(join(tmpdir(), 'dailypot-e2e-'))): Promise<{
  app: ElectronApplication
  page: Page
  dataDir: string
}> {
  const env: Record<string, string | undefined> = { ...process.env, DAILYPOT_DATA_DIR: dataDir }
  delete env['ELECTRON_RENDERER_URL']
  delete env['ELECTRON_RUN_AS_NODE'] // set by VS Code's extension host; makes electron.exe act as Node
  const app = await electron.launch({ args: [resolve(__dirname, '../..')], env: env as Record<string, string> })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, dataDir }
}
