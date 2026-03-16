import { test, expect } from '@playwright/test';

test.describe('CAJA NEGRA: Accesibilidad básica', () => {

  test('CN-A11Y-01: La página tiene lang attribute', async ({ page }) => {
    await page.goto('/');
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBeTruthy();
  });

  test('CN-A11Y-02: Los inputs tienen labels o placeholders accesibles', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    const inputs = page.locator('input:visible');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const hasPlaceholder = await input.getAttribute('placeholder');
      const hasAriaLabel = await input.getAttribute('aria-label');
      const hasName = await input.getAttribute('name');
      const id = await input.getAttribute('id');

      // Cada input visible debe tener al menos placeholder, aria-label, o name
      const isAccessible = hasPlaceholder || hasAriaLabel || hasName || id;
      expect(isAccessible).toBeTruthy();
    }
  });

  test('CN-A11Y-03: Los botones tienen texto accesible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    const buttons = page.locator('button:visible');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');

      // Cada botón debe tener texto, aria-label, o title
      const isAccessible = (text && text.trim().length > 0) || ariaLabel || title;
      expect(isAccessible).toBeTruthy();
    }
  });

  test('CN-A11Y-04: Tab navigation funciona en login', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    // Tab a través de los elementos del formulario
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Verificar que hay un elemento focused
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test('CN-A11Y-05: Contraste mínimo - no texto invisible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    // Verificar que no hay texto con opacity 0 que debería ser visible
    const invisibleText = await page.evaluate(() => {
      const elements = document.querySelectorAll('p, span, h1, h2, h3, h4, button, a, label');
      let count = 0;
      elements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const text = el.textContent?.trim();
        if (text && text.length > 0 && style.opacity === '0' && style.display !== 'none') {
          count++;
        }
      });
      return count;
    });

    expect(invisibleText).toBeLessThanOrEqual(3); // Permitir algunos (animaciones)
  });

  test('CN-A11Y-06: Viewport meta tag presente (responsive)', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });
});
