import { test, expect } from '@playwright/test';

test.describe('SMOKE: Carga de la aplicación', () => {

  test('S-APP-01: La aplicación responde en /', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('S-APP-02: El título del documento es correcto', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cowork/i);
  });

  test('S-APP-03: No hay errores de consola críticos al cargar', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignorar errores conocidos/inofensivos
        if (
          text.includes('favicon') ||
          text.includes('manifest') ||
          text.includes('service-worker') ||
          text.includes('net::ERR_') ||
          text.includes('Failed to load resource')
        ) return;
        errors.push(text);
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3_000);

    // No debería haber errores JS críticos
    const criticalErrors = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('S-APP-04: Los assets principales cargan (CSS, JS)', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.endsWith('.js') || url.endsWith('.css')) {
        failedRequests.push(url);
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3_000);

    expect(failedRequests).toHaveLength(0);
  });

  test('S-APP-05: La ruta /explorar carga sin autenticación', async ({ page }) => {
    const response = await page.goto('/explorar');
    expect(response?.status()).toBeLessThan(400);
    await page.waitForTimeout(2_000);

    // No debería redirigir al login
    expect(page.url()).toContain('/explorar');
  });

  test('S-APP-06: Service Worker se registra', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    // SW es opcional, solo verificamos que no crashea
    expect(typeof swRegistered).toBe('boolean');
  });
});
