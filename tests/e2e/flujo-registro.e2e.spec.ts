import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects';

test.describe('E2E: Flujo de registro de usuario', () => {

  test('E2E-REG-01: Formulario de registro se muestra correctamente', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    // Verificar campos de registro
    await expect(loginPage.nameInput).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();

    // El botón debería decir "Crear Cuenta"
    await expect(loginPage.submitButton).toContainText(/Crear Cuenta/i);
  });

  test('E2E-REG-02: Registro con email ya existente muestra error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Usar un email que sabemos que ya existe
    await loginPage.register(
      'Test Duplicado',
      'qa-test@cowork.app',  // email que ya debería existir
      'Password123!'
    );

    await page.waitForTimeout(5_000);

    // Debería mostrar un error o un feedback
    // (el comportamiento depende de la configuración de Supabase)
    const hasError = await loginPage.errorMessage.isVisible().catch(() => false);
    const hasFeedback = await loginPage.authFeedback.isVisible().catch(() => false);

    // Al menos uno debería aparecer
    expect(hasError || hasFeedback).toBeTruthy();
  });

  test('E2E-REG-03: Registro valida contraseña mínima (6 chars)', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    await loginPage.nameInput.fill('Test User');
    await loginPage.emailInput.fill('test-short-pass@test.com');
    await loginPage.passwordInput.fill('123');  // Menor a 6 chars

    await loginPage.submitButton.click();

    // El navegador debería bloquear el envío (minLength=6) o Supabase rechazar
    await page.waitForTimeout(2_000);

    // El formulario sigue visible (no avanzó)
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('E2E-REG-04: Registro con email inválido no envía formulario', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.switchToRegister();

    await loginPage.nameInput.fill('Test User');
    await loginPage.emailInput.fill('no-es-un-email');
    await loginPage.passwordInput.fill('Password123!');

    await loginPage.submitButton.click();
    await page.waitForTimeout(1_000);

    // El HTML5 validation debería impedir el envío
    await expect(loginPage.emailInput).toBeVisible();
  });
});
