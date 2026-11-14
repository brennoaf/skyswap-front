import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const phone = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'dark', use: { ...phone, colorScheme: 'dark' } },
    { name: 'light', use: { ...phone, colorScheme: 'light' } },
  ],
  webServer: [
    {
      command: 'npm --prefix ../api start',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { SKYSWAP_DB: join(tmpdir(), `skyswap-e2e-${Date.now()}.sqlite`) },
    },
    { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
  ],
})
