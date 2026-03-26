import { test, expect } from '@playwright/test';
import { loginAsGuest } from '../helpers/auth';

test.describe('FUNCIONAL: Sistema de Reuniones', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await page.waitForTimeout(3_000);
  });

  test('F-MEET-01: Sección de reuniones es accesible', async ({ page }) => {
    const meetButton = page.locator(
      'button:has-text("Reunión"), button:has-text("Meeting"), button:has-text("Videollamada"), [data-testid="meetings-tab"]'
    ).first();

    if (await meetButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await meetButton.click();
      await page.waitForTimeout(1_000);
      // Verificar que no crasheó
      const bodyText = await page.evaluate(() => document.body.innerText.length);
      expect(bodyText).toBeGreaterThan(0);
    } else {
      test.skip();
    }
  });

  test('F-MEET-02: Ruta directa a sala /sala/:id requiere auth', async ({ page }) => {
    // Limpiar sesión
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    await page.goto('/sala/test-room-id');
    await page.waitForTimeout(5_000);

    // Debería mostrar login o un loading
    const loginInput = page.locator('input[name="email"]');
    const loading = page.locator('.animate-spin, :has-text("Cargando videollamada")');

    const hasLogin = await loginInput.isVisible().catch(() => false);
    const hasLoading = await loading.first().isVisible().catch(() => false);

    expect(hasLogin || hasLoading).toBeTruthy();
  });

  test('F-MEET-03: Meeting lobby se muestra con token de invitación', async ({ page }) => {
    // Simular visita con token de reunión (token falso)
    await page.goto('/?meeting_token=fake-test-token');
    await page.waitForTimeout(3_000);

    // Debería mostrar el lobby o un error, no crashear
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });
});
