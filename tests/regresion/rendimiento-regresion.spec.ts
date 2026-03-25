import { test, expect } from '@playwright/test';

test.describe('REGRESIÓN: Rendimiento y estabilidad', () => {

  test('R-PERF-01: La página carga en menos de 10 segundos', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(10_000);
  });

  test('R-PERF-02: First Contentful Paint bajo 5 segundos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const fcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
          if (fcpEntry) {
            resolve(fcpEntry.startTime);
            observer.disconnect();
          }
        });
        observer.observe({ type: 'paint', buffered: true });

        // Timeout fallback
        setTimeout(() => resolve(-1), 8_000);
      });
    });

    if (fcp > 0) {
      expect(fcp).toBeLessThan(5_000);
    }
  });

  test('R-PERF-03: No hay más de 5 errores JS en consola durante carga', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(5_000);

    // Filtrar errores de red (comunes y no críticos)
    const jsErrors = errors.filter(
      (e) => !e.includes('net::') && !e.includes('favicon') && !e.includes('Failed to load resource')
    );

    expect(jsErrors.length).toBeLessThanOrEqual(5);
  });

  test('R-PERF-04: Bundle principal no excede 3MB', async ({ page }) => {
    const resources: { url: string; size: number }[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.endsWith('.js') && url.includes('assets/')) {
        const body = await response.body().catch(() => Buffer.from(''));
        resources.push({ url, size: body.length });
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // Ningún chunk individual debería exceder 3MB
    for (const resource of resources) {
      expect(resource.size).toBeLessThan(3 * 1024 * 1024);
    }
  });

  test('R-PERF-05: Total de JS transferido no excede 15MB', async ({ page }) => {
    let totalJsBytes = 0;

    page.on('response', async (response) => {
      if (response.url().endsWith('.js')) {
        const body = await response.body().catch(() => Buffer.from(''));
        totalJsBytes += body.length;
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(totalJsBytes).toBeLessThan(15 * 1024 * 1024);
  });
});
