import { defineConfig } from '@playwright/test'

/** README screenshot tour (npm run screenshots). Kept out of CI. */
export default defineConfig({
  testDir: 'tests/showcase',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']]
})
