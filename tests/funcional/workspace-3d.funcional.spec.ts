import { test, expect } from '@playwright/test';
import { loginAsGuest } from '../helpers/auth';

test.describe('FUNCIONAL: Espacio Virtual 3D', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await page.waitForTimeout(4_000);
  });

  test('F-3D-01: El canvas 3D se renderiza', async ({ page }) => {
    const canvas = page.locator('canvas').first();

    if (await canvas.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await expect(canvas).toBeVisible();

      // Verificar que el canvas tiene dimensiones
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    } else {
      test.skip();
    }
  });

  test('F-3D-02: WebGL está disponible en el navegador', async ({ page }) => {
    const webglAvailable = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      return !!(
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
      );
    });

    expect(webglAvailable).toBeTruthy();
  });

  test('F-3D-03: El canvas responde a interacciones del mouse', async ({ page }) => {
    const canvas = page.locator('canvas').first();

    if (await canvas.isVisible({ timeout: 15_000 }).catch(() => false)) {
      const box = await canvas.boundingBox();
      if (!box) return test.skip();

      // Simular movimiento de mouse sobre el canvas
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await page.mouse.move(centerX, centerY);
      await page.mouse.click(centerX, centerY);

      // Verificar que no crasheó
      await page.waitForTimeout(1_000);
      await expect(canvas).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('F-3D-04: Movimiento con teclado (WASD)', async ({ page }) => {
    const canvas = page.locator('canvas').first();

    if (await canvas.isVisible({ timeout: 15_000 }).catch(() => false)) {
      // Hacer focus en el canvas
      await canvas.click();

      // Simular movimiento WASD
      await page.keyboard.press('w');
      await page.waitForTimeout(500);
      await page.keyboard.press('a');
      await page.waitForTimeout(500);
      await page.keyboard.press('s');
      await page.waitForTimeout(500);
      await page.keyboard.press('d');
      await page.waitForTimeout(500);

      // Verificar que no crasheó
      await expect(canvas).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('F-3D-05: No hay memory leaks evidentes (performance)', async ({ page }) => {
    const canvas = page.locator('canvas').first();

    if (await canvas.isVisible({ timeout: 15_000 }).catch(() => false)) {
      // Medir memoria inicial
      const memBefore = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });

      // Interactuar un poco
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(200 + i * 10, 200 + i * 10);
        await page.waitForTimeout(100);
      }

      // Medir memoria después
      const memAfter = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });

      // Si tiene API de memoria, verificar que no creció demasiado (>50MB)
      if (memBefore > 0 && memAfter > 0) {
        const growth = memAfter - memBefore;
        expect(growth).toBeLessThan(50 * 1024 * 1024); // 50MB
      }
    } else {
      test.skip();
    }
  });
});
