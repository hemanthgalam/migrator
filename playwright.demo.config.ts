import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the static GitHub Pages build (in-browser API).
// Build first with: VITE_BASE=/migrator/ npm run build:demo
const PORT = 4322;

export default defineConfig({
  testDir: './e2e-demo',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/migrator/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx vite preview --config web/vite.config.ts --outDir dist-demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/migrator/`,
    reuseExistingServer: false,
    env: { VITE_BASE: '/migrator/' },
  },
});
