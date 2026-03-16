import { test, expect } from '@playwright/test';

test.describe('CAJA NEGRA: Respuestas de API / red', () => {

  test('CN-API-01: Supabase REST endpoint responde', async ({ page }) => {
    // Interceptar la primera llamada a Supabase para verificar conectividad
    const supabaseResponses: number[] = [];

    page.on('response', (response) => {
      if (response.url().includes('supabase')) {
        supabaseResponses.push(response.status());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(5_000);

    // Si hubo llamadas a Supabase, ninguna debería ser 500+
    const serverErrors = supabaseResponses.filter((s) => s >= 500);
    expect(serverErrors).toHaveLength(0);
  });

  test('CN-API-02: La app maneja error de red gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    // Simular offline
    await page.context().setOffline(true);

    // Intentar alguna acción que requiera red
    await page.reload().catch(() => {});
    await page.waitForTimeout(3_000);

    // Restaurar red
    await page.context().setOffline(false);
    await page.goto('/');
    await page.waitForTimeout(3_000);

    // La app debería recuperarse
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('CN-API-03: Respuesta lenta de API no congela la UI', async ({ page }) => {
    // Simular latencia alta en APIs
    await page.route('**/rest/**', async (route) => {
      await new Promise((r) => setTimeout(r, 3_000)); // 3s delay
      await route.continue();
    });

    await page.goto('/');

    // La UI debería seguir respondiendo (mostrar loading/spinner)
    await page.waitForTimeout(1_000);
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);

    // Limpiar route
    await page.unrouteAll();
  });

  test('CN-API-04: Error 401 de Supabase redirige a login', async ({ page }) => {
    // Simular respuesta 401 en cualquier llamada autenticada
    await page.route('**/rest/v1/**', (route) => {
      route.fulfill({
        status: 401,
        body: JSON.stringify({ message: 'JWT expired' }),
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await page.goto('/');
    await page.waitForTimeout(5_000);

    // Debería mostrar login
    const loginInput = page.locator('input[name="email"]');
    await expect(loginInput).toBeVisible({ timeout: 10_000 });

    await page.unrouteAll();
  });

  test('CN-API-05: Respuesta malformada no causa crash', async ({ page }) => {
    // Interceptar una API y devolver JSON malformado
    await page.route('**/rest/v1/espacios_trabajo**', (route) => {
      route.fulfill({
        status: 200,
        body: '{ invalid json }}',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await page.goto('/');
    await page.waitForTimeout(5_000);

    // No debería haber white screen
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);

    await page.unrouteAll();
  });
});
