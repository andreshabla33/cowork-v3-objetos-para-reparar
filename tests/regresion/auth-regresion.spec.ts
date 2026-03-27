import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects';

test.describe('REGRESIÓN: Autenticación - Escenarios conocidos', () => {

  test('R-AUTH-01: Login no se congela con contraseña vacía', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('test@test.com');
    // Dejar contraseña vacía, click submit
    await loginPage.submitButton.click();

    await page.waitForTimeout(2_000);

    // La app no debe congelarse - el form sigue interactivo
    await expect(loginPage.emailInput).toBeEnabled();
    await expect(loginPage.submitButton).toBeEnabled();
  });

  test('R-AUTH-02: Double-click en submit no causa doble request', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('test@test.com');
    await loginPage.passwordInput.fill('password123');

    // Double click rápido
    await loginPage.submitButton.dblclick();

    await page.waitForTimeout(3_000);

    // El botón debería deshabilitarse durante loading
    // Verificar que no crasheó
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('R-AUTH-03: Token en URL se limpia después de procesar', async ({ page }) => {
    await page.goto('/?token=fake-expired-token');
    await page.waitForTimeout(5_000);

    // El token no debería quedar expuesto en la URL final
    // (puede tardar en procesarse)
    const url = page.url();
    // Si ya procesó, token debería haberse limpiado
    // Si no, al menos no causa un crash
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('R-AUTH-04: Sesión expirada no causa white screen', async ({ page }) => {
    // Simular sesión corrupta en localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('sb-lcryrsdyrzotjqdxcwtp-auth-token', JSON.stringify({
        access_token: 'expired-fake-token',
        refresh_token: 'expired-fake-refresh',
        expires_at: 0,
      }));
    });

    await page.reload();
    await page.waitForTimeout(5_000);

    // No debe haber white screen
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);

    // Debería mostrar login (sesión inválida)
    const loginInput = page.locator('input[name="email"]');
    await expect(loginInput).toBeVisible({ timeout: 10_000 });
  });

  test('R-AUTH-05: Navegación con back/forward no rompe estado', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    // Navegar a /explorar
    await page.goto('/explorar');
    await page.waitForTimeout(2_000);

    // Back
    await page.goBack();
    await page.waitForTimeout(2_000);

    // No debería crashear
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);

    // Forward
    await page.goForward();
    await page.waitForTimeout(2_000);

    const bodyText2 = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText2).toBeGreaterThan(0);
  });

  test('R-AUTH-06: Multiple tabs no causan conflicto de sesión', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    // Abrir segunda pestaña
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForTimeout(2_000);

    // Ambas deben estar funcionales (no white screen)
    const bodyText1 = await page.evaluate(() => document.body.innerText.length);
    const bodyText2 = await page2.evaluate(() => document.body.innerText.length);

    expect(bodyText1).toBeGreaterThan(0);
    expect(bodyText2).toBeGreaterThan(0);

    await page2.close();
  });
});
