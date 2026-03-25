import { test as setup, expect } from '@playwright/test';
import { TEST_CONFIG } from './helpers/test-config';

/**
 * Global Setup: Autentica un usuario de test y guarda el estado
 * para reutilizar en todas las suites sin repetir login.
 *
 * Para crear los usuarios de prueba en Supabase, ejecuta:
 *   node tests/scripts/seed-test-users.mjs
 */
const AUTH_STATE_FILE = 'tests/.auth/user.json';

setup('autenticar usuario de prueba', async ({ page }) => {
  // Navegar al login
  await page.goto('/');
  await page.waitForSelector('input[name="email"]', { timeout: 20_000 });

  // Login con credenciales de test
  await page.fill('input[name="email"]', TEST_CONFIG.testUser.email);
  await page.fill('input[name="password"]', TEST_CONFIG.testUser.password);
  await page.click('button[type="submit"]');

  // Esperar a que el login sea exitoso (desaparezca el form)
  await page.waitForSelector('input[name="email"]', {
    state: 'hidden',
    timeout: 30_000,
  });

  // Guardar estado de autenticación
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
