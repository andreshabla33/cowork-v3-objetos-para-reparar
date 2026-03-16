import { type Page } from '@playwright/test';
import { TEST_CONFIG } from './test-config';

/**
 * Login via UI (email + password)
 */
export async function loginViaUI(
  page: Page,
  email = TEST_CONFIG.testUser.email,
  password = TEST_CONFIG.testUser.password,
) {
  await page.goto('/');
  // Esperar a que cargue el formulario de login
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Esperar a que desaparezca el login screen
  await page.waitForSelector('input[name="email"]', { state: 'hidden', timeout: 20_000 });
}

/**
 * Login como invitado (mock session)
 */
export async function loginAsGuest(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  // Click botón "Invitado"
  await page.click('button:has-text("Invitado")');
  await page.waitForSelector('input[name="email"]', { state: 'hidden', timeout: 10_000 });
}

/**
 * Registrar usuario nuevo via UI
 */
export async function registerViaUI(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  await page.goto('/');
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  // Cambiar a modo registro
  await page.click('button:has-text("Crea una aquí")');
  await page.waitForSelector('input[name="name"]', { timeout: 5_000 });

  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/**
 * Logout: limpia localStorage y cookies
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.reload();
}

/**
 * Verifica que el usuario está autenticado (no ve login screen)
 */
export async function assertAuthenticated(page: Page) {
  // No debería verse el formulario de login
  const loginForm = page.locator('input[name="email"]');
  await loginForm.waitFor({ state: 'hidden', timeout: 15_000 });
}

/**
 * Verifica que el usuario NO está autenticado (ve login screen)
 */
export async function assertNotAuthenticated(page: Page) {
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
}
