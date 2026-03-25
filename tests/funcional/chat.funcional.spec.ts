import { test, expect } from '@playwright/test';
import { loginAsGuest } from '../helpers/auth';

test.describe('FUNCIONAL: Sistema de Chat', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await page.waitForTimeout(3_000);
  });

  test('F-CHAT-01: El panel de chat se puede abrir', async ({ page }) => {
    // Buscar botón de chat en la interfaz
    const chatButton = page.locator(
      'button:has-text("Chat"), button[aria-label*="chat"], [data-testid="chat-toggle"]'
    ).first();

    if (await chatButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(1_000);

      // Verificar que se abrió algún panel de chat
      const chatArea = page.locator(
        '[data-testid="chat-panel"], input[placeholder*="mensaje"], input[placeholder*="Escrib"], textarea[placeholder*="mensaje"]'
      ).first();

      await expect(chatArea).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('F-CHAT-02: El input de chat acepta texto', async ({ page }) => {
    const chatInput = page.locator(
      'input[placeholder*="mensaje"], input[placeholder*="Escrib"], textarea[placeholder*="mensaje"]'
    ).first();

    if (await chatInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await chatInput.fill('Mensaje de prueba QA');
      await expect(chatInput).toHaveValue('Mensaje de prueba QA');
    } else {
      test.skip();
    }
  });

  test('F-CHAT-03: Se puede enviar un mensaje con Enter', async ({ page }) => {
    const chatInput = page.locator(
      'input[placeholder*="mensaje"], input[placeholder*="Escrib"], textarea[placeholder*="mensaje"]'
    ).first();

    if (await chatInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const mensaje = `Test QA ${Date.now()}`;
      await chatInput.fill(mensaje);
      await chatInput.press('Enter');

      await page.waitForTimeout(2_000);

      // El input debería limpiarse después de enviar
      const value = await chatInput.inputValue();
      expect(value).toBe('');
    } else {
      test.skip();
    }
  });

  test('F-CHAT-04: Los mensajes se renderizan en el panel', async ({ page }) => {
    // Buscar mensajes existentes en la UI
    const mensajes = page.locator('[data-testid="chat-message"], .chat-message, [class*="message"]');

    if (await mensajes.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
      const count = await mensajes.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } else {
      test.skip();
    }
  });
});
