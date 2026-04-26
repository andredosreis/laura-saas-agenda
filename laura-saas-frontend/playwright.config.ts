import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para E2E tests do Marcai.
 *
 * Comandos:
 *   npm run test:e2e          # headless, todos os browsers
 *   npm run test:e2e:ui       # modo UI para debug
 *
 * O webServer levanta o Vite dev server automaticamente se não estiver a correr.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Idioma pt-PT alinha com a app
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Adicionar firefox/webkit/mobile depois — começamos só com chromium
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
