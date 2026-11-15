import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const phone = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }
const apiPort = Number(process.env.E2E_API_PORT ?? 4000)
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000)
const webUrl = `http://localhost:${webPort}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? webUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'dark', use: { ...phone, colorScheme: 'dark' } },
    { name: 'light', use: { ...phone, colorScheme: 'light' } },
  ],
  webServer: [
    {
      command: 'npm --prefix ../api start',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { PORT: String(apiPort), WEB_ORIGIN: webUrl, SKYSWAP_ORIGIN: webUrl, SKYSWAP_DB: join(tmpdir(), `skyswap-e2e-${Date.now()}.sqlite`) },
    },
    { command: `npx next dev -p ${webPort}`, url: webUrl, reuseExistingServer: true, timeout: 120_000, env: { SKYSWAP_API_URL: `http://127.0.0.1:${apiPort}` } },
  ],
})
