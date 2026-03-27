import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Configuración QA Cowork Virtual Workspace
 * ===========================================================
 * Suites disponibles:
 *   npm run test:smoke      → Pruebas de humo (críticas)
 *   npm run test:e2e        → End-to-end (flujos completos)
 *   npm run test:funcional  → Funcionales (features)
 *   npm run test:regresion  → Regresión (bugs conocidos)
 *   npm run test:caja-negra → Caja negra (input/output)
 *   npm run test:all        → Todas las suites
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['html', { open: 'on-failure' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },

  projects: [
    // --- Setup: autenticación persistente ---
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // --- SMOKE: pruebas críticas (deben pasar siempre) ---
    {
      name: 'smoke',
      testDir: './tests/smoke',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // --- E2E: flujos completos de usuario ---
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // --- FUNCIONAL: features individuales ---
    {
      name: 'funcional',
      testDir: './tests/funcional',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // --- REGRESIÓN: escenarios de bugs conocidos ---
    {
      name: 'regresion',
      testDir: './tests/regresion',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // --- CAJA NEGRA: validación input/output ---
    {
      name: 'caja-negra',
      testDir: './tests/caja-negra',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // --- MOBILE: responsive ---
    {
      name: 'mobile',
      testDir: './tests/smoke',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
