import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para E2E tests do Marcai.
 *
 * Comandos:
 *   npm run test:e2e          # headless, todos os browsers
 *   npm run test:e2e:ui       # modo UI para debug
 *
 * O webServer levanta o Vite dev server automaticamente se não estiver a correr.
 *
 * Porta parametrizável via E2E_PORT (default 5173) — permite isolar worktrees
 * paralelos que não podem partilhar a 5173.
 */
const E2E_PORT = process.env.E2E_PORT || '5173';
const BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
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
    command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
