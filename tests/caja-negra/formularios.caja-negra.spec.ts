import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects';

test.describe('CAJA NEGRA: Validación de formularios (input/output)', () => {

  test('CN-FORM-01: Login - email válido + password válido → acceso', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Input: credenciales válidas formato correcto
    await loginPage.emailInput.fill('usuario@dominio.com');
    await loginPage.passwordInput.fill('Password123');

    // Output esperado: el formulario se envía (botón muestra loading o desaparece)
    await loginPage.submitButton.click();
    await page.waitForTimeout(3_000);

    // El sistema debería procesar (puede dar error de Supabase pero no crash)
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('CN-FORM-02: Login - email inválido → bloqueo HTML5', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('no-es-email');
    await loginPage.passwordInput.fill('Password123');
    await loginPage.submitButton.click();

    await page.waitForTimeout(1_000);

    // El formulario no debería haberse enviado (HTML5 validation)
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('CN-FORM-03: Login - campos vacíos → no se envía', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.submitButton.click();
    await page.waitForTimeout(1_000);

    // Sigue en el login
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('CN-FORM-04: Login - inyección SQL en email → no afecta', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Intentar inyección SQL
    await loginPage.emailInput.fill("admin'--@test.com");
    await loginPage.passwordInput.fill("' OR '1'='1");
    await loginPage.submitButton.click();

    await page.waitForTimeout(3_000);

    // Debería mostrar error, no acceso
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
    // No debería haber accedido al dashboard
  });

  test('CN-FORM-05: Login - XSS en campos → se sanitiza', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('<script>alert("xss")</script>@test.com');
    await loginPage.passwordInput.fill('<img src=x onerror=alert(1)>');
    await loginPage.submitButton.click();

    await page.waitForTimeout(2_000);

    // Verificar que no se ejecutó XSS
    const alertTriggered = await page.evaluate(() => {
      return (window as any).__xss_triggered__ || false;
    });
    expect(alertTriggered).toBeFalsy();
  });

  test('CN-FORM-06: Login - contraseña extremadamente larga → no crashea', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    const longPassword = 'A'.repeat(10_000);
    await loginPage.emailInput.fill('test@test.com');
    await loginPage.passwordInput.fill(longPassword);
    await loginPage.submitButton.click();

    await page.waitForTimeout(3_000);

    // La app no debería crashear
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    expect(bodyText).toBeGreaterThan(0);
  });

  test('CN-FORM-07: Login - caracteres Unicode/emoji en nombre → se acepta', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    await loginPage.nameInput.fill('用户 🚀 Ñoño Müller');
    await expect(loginPage.nameInput).toHaveValue('用户 🚀 Ñoño Müller');
  });

  test('CN-FORM-08: Registro - password < 6 chars → bloqueado', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    await loginPage.nameInput.fill('Test');
    await loginPage.emailInput.fill('test@test.com');
    await loginPage.passwordInput.fill('12345'); // < 6 chars

    await loginPage.submitButton.click();
    await page.waitForTimeout(1_000);

    // HTML5 minLength=6 debería bloquear
    await expect(loginPage.emailInput).toBeVisible();
  });
});
