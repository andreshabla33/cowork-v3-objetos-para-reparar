import { test, expect } from '@playwright/test';
import { loginAsGuest } from '../helpers/auth';

test.describe('SMOKE: Navegación básica post-login', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    // Esperar carga inicial
    await page.waitForTimeout(3_000);
  });

  test('S-NAV-01: Después del login se ve el dashboard o workspace', async ({ page }) => {
    // Verificar que no estamos en login
    const loginInput = page.locator('input[name="email"]');
    await expect(loginInput).not.toBeVisible();

    // Debería verse algún contenido principal
    const mainContent = page.locator('body');
    await expect(mainContent).not.toBeEmpty();
  });

  test('S-NAV-02: La URL no contiene tokens expuestos', async ({ page }) => {
    const url = page.url();
    expect(url).not.toContain('token=');
    expect(url).not.toContain('access_token=');
    expect(url).not.toContain('refresh_token=');
  });

  test('S-NAV-03: No hay pantallas en blanco (white screen)', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const bodyContent = await page.evaluate(() => {
      return document.body.innerText.trim().length;
    });

    // El body debe tener contenido (no pantalla en blanco)
    expect(bodyContent).toBeGreaterThan(0);
  });

  test('S-NAV-04: La app responde a interacciones (no está congelada)', async ({ page }) => {
    // Verificar que la app responde a clicks
    const startTime = Date.now();
    await page.mouse.click(100, 100);
    const elapsed = Date.now() - startTime;

    // El click no debería bloquear por más de 5 segundos
    expect(elapsed).toBeLessThan(5_000);
  });
});
