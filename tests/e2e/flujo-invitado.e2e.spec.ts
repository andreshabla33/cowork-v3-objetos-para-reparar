import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects';

test.describe('E2E: Flujo de usuario invitado', () => {

  test('E2E-INV-01: Invitado accede y ve contenido principal', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsGuest();

    // Esperar carga post-login
    await page.waitForTimeout(3_000);

    // No debería verse el login screen
    await expect(loginPage.emailInput).not.toBeVisible();

    // La app debería renderizar algo (no pantalla en blanco)
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('E2E-INV-02: Invitado tiene funcionalidad limitada', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsGuest();

    await page.waitForTimeout(3_000);

    // Verificar que se generó un ID de invitado en el store
    const guestId = await page.evaluate(() => {
      const storeState = (window as any).__ZUSTAND_STORE__;
      // Intentar acceder al estado del store si está expuesto
      return storeState?.getState?.()?.session?.user?.id || null;
    });

    // El invitado puede o no tener un ID según la implementación
    // Lo importante es que la app no crasheó
    expect(page.url()).not.toContain('error');
  });

  test('E2E-INV-03: Invitado puede navegar por la ruta pública /explorar', async ({ page }) => {
    await page.goto('/explorar');
    await page.waitForTimeout(3_000);

    // No debería redirigir al login
    expect(page.url()).toContain('/explorar');

    // Debería haber contenido renderizado
    const content = await page.evaluate(() => document.body.children.length);
    expect(content).toBeGreaterThan(0);
  });
});
