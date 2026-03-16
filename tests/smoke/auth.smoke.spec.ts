import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects';
import { TEST_CONFIG } from '../helpers/test-config';

test.describe('SMOKE: Autenticación', () => {
  test.describe.configure({ mode: 'serial' });

  test('S-AUTH-01: La página de login carga correctamente', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.assertVisible();

    // Verificar elementos clave del formulario
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.googleButton).toBeVisible();
    await expect(loginPage.guestButton).toBeVisible();
  });

  test('S-AUTH-02: Login con email y contraseña válidos', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    // Debería desaparecer el login
    await expect(loginPage.emailInput).not.toBeVisible({ timeout: 20_000 });
  });

  test('S-AUTH-03: Login con credenciales inválidas muestra error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('falso@email.com', 'password_incorrecta');

    await loginPage.assertError();
    // El formulario debe seguir visible
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('S-AUTH-04: Acceso como invitado funciona', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsGuest();

    // El login screen debería desaparecer
    await expect(loginPage.emailInput).not.toBeVisible({ timeout: 15_000 });
  });

  test('S-AUTH-05: Toggle entre login y registro funciona', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Inicialmente no se ve el campo nombre
    await expect(loginPage.nameInput).not.toBeVisible();

    // Cambiar a registro
    await loginPage.switchToRegister();
    await expect(loginPage.nameInput).toBeVisible();

    // Volver a login
    await loginPage.switchToLogin();
    await expect(loginPage.nameInput).not.toBeVisible();
  });

  test('S-AUTH-06: Formulario valida campos requeridos', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Intentar submit sin datos - el browser valida HTML5
    await loginPage.submitButton.click();

    // El form sigue visible (no se envió)
    await expect(loginPage.emailInput).toBeVisible();
  });
});
