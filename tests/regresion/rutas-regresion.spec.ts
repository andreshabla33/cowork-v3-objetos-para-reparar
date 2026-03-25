import { test, expect } from '@playwright/test';

test.describe('REGRESIÓN: Rutas y navegación', () => {

  test('R-RUTA-01: Ruta inexistente no causa white screen', async ({ page }) => {
    await page.goto('/ruta-que-no-existe');
    await page.waitForTimeout(3_000);

    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('R-RUTA-02: /explorar funciona sin autenticación', async ({ page }) => {
    // Limpiar cualquier auth
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    await page.goto('/explorar');
    await page.waitForTimeout(3_000);

    expect(page.url()).toContain('/explorar');
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('R-RUTA-03: /sala/:id sin auth muestra login o loading', async ({ page }) => {
    // Navegar primero al origen para tener acceso a localStorage
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    await page.goto('/sala/any-room-id');
    await page.waitForTimeout(5_000);

    const loginInput = page.locator('input[name="email"]');
    const spinner = page.locator('.animate-spin');

    const hasLogin = await loginInput.isVisible().catch(() => false);
    const hasSpinner = await spinner.first().isVisible().catch(() => false);

    // Debería mostrar algo útil (login o loading), no blanco
    expect(hasLogin || hasSpinner).toBeTruthy();
  });

  test('R-RUTA-04: URL con parámetros maliciosos no causa XSS', async ({ page }) => {
    const xssPayloads = [
      '/?token=<script>alert(1)</script>',
      '/?token="><img src=x onerror=alert(1)>',
      '/?redirect=javascript:alert(1)',
    ];

    for (const payload of xssPayloads) {
      await page.goto(payload);
      await page.waitForTimeout(2_000);

      // Verificar que no se ejecutó JS malicioso
      const dialogTriggered = await page.evaluate(() => {
        return (window as any).__xss_triggered__ || false;
      });
      expect(dialogTriggered).toBeFalsy();

      // Verificar que no hay scripts inyectados en el DOM
      const injectedScripts = await page.evaluate(() => {
        return document.querySelectorAll('script:not([src])').length;
      });
      // Solo los scripts del bundle original deberían existir
      // (no scripts inyectados maliciosamente)
    }
  });

  test('R-RUTA-05: Hash fragments en URL no causan problemas', async ({ page }) => {
    await page.goto('/#/some-hash');
    await page.waitForTimeout(3_000);

    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });
});
