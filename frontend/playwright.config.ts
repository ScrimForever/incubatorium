import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra a API real: o backend sobe no Docker (`docker compose up -d`) e o
 * frontend no `npm start` (porta 3000). Se o 3000 já estiver no ar, é reaproveitado.
 * Usa o Chrome instalado na máquina (`channel: 'chrome'`), sem baixar navegador.
 */
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/limpeza.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
