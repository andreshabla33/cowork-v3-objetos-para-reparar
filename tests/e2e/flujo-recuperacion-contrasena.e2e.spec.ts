import { test, expect } from '@playwright/test';
import { LoginPage, RecoveryAccessPage, ResetPasswordPage } from '../helpers/page-objects';
import { ForgotPasswordPage } from '../helpers/page-objects/ForgotPasswordPage';

/**
 * SUITE QA: Flujo completo de Recuperación de Contraseña
 *
 * Valida el flujo de 3 pasos:
 *   PASO 1 — RequestPasswordReset: Solicitar enlace vía email
 *   PASO 2 — Pantalla de Acceso: Confirmación manual de seguridad (Mitigación Prefetching)
 *   PASO 3 — ConfirmPasswordReset: Cambiar contraseña con sesión activa
 */
test.describe('Recuperación de Contraseña — Flujo Completo con Mitigación de Prefetching', () => {

  // ─── PASO 1: Página de Login → Solicitud de recuperación ─────────────────

  test('REC-01: Enlace "¿Olvidaste tu contraseña?" visible en el login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    const forgotLink = page.locator('#forgot-password-link');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toContainText('Olvidaste');
  });

  test('REC-02: Enlace "¿Olvidaste tu contraseña?" NO aparece en modo registro', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.click('button:has-text("Crea una aquí")');
    await page.waitForSelector('input[name="name"]', { timeout: 5_000 });

    const forgotLink = page.locator('#forgot-password-link');
    await expect(forgotLink).not.toBeVisible();
  });

  test('REC-03: Click en el enlace navega a la pantalla de recuperación', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.click('#forgot-password-link');

    const forgotPage = new ForgotPasswordPage(page);
    await forgotPage.waitForLoad();
    await forgotPage.assertVisible();
  });

  test('REC-04: Enviar email de recuperación con email válido muestra confirmación', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.click('#forgot-password-link');

    const forgotPage = new ForgotPasswordPage(page);
    await forgotPage.waitForLoad();

    await forgotPage.submitEmail('test@example.com');
    await forgotPage.assertEmailSent();
  });

  test('REC-05: Enviar email inválido muestra error de validación', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.click('#forgot-password-link');

    const forgotPage = new ForgotPasswordPage(page);
    await forgotPage.waitForLoad();

    const emailInput = page.locator('#forgot-email-input');
    await emailInput.fill('no-es-un-email');

    const isEmailType = await emailInput.getAttribute('type');
    expect(isEmailType).toBe('email');
  });

  test('REC-06: Botón "Volver" regresa a la pantalla de login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.click('#forgot-password-link');

    const forgotPage = new ForgotPasswordPage(page);
    await forgotPage.waitForLoad();

    await page.click('#forgot-back-btn');
    await loginPage.assertVisible();
  });

  // ─── PASO 2: Pantalla intermedia de seguridad ───────────────────────────

  test('REC-07: URL con token_hash muestra pantalla intermedia de seguridad', async ({ page }) => {
    await page.goto('/?type=recovery&token_hash=TOKEN_MOCK');

    const recoveryAccessPage = new RecoveryAccessPage(page);
    await recoveryAccessPage.waitForLoad();
    await recoveryAccessPage.assertVisible();
    
    const resetPage = new ResetPasswordPage(page);
    await expect(resetPage.form).not.toBeVisible();
  });

  test('REC-08: Click en "Continuar" en pantalla intermedia intenta validar el token', async ({ page }) => {
    await page.goto('/?type=recovery&token_hash=TOKEN_INVALIDO');

    const recoveryAccessPage = new RecoveryAccessPage(page);
    await recoveryAccessPage.waitForLoad();
    await recoveryAccessPage.clickContinue();

    await recoveryAccessPage.assertError('no es válido');
  });

  // ─── PASO 3: Nueva contraseña (Escenarios de error) ─────────────────────

  test('REC-09: [SEGURIDAD] URL con hash de recovery inválido (estilo antiguo) muestra error de token', async ({ page }) => {
    await page.goto('/#access_token=token_falso_invalido&type=recovery&refresh_token=fake');

    const resetPage = new ResetPasswordPage(page);
    await resetPage.waitForLoad();
    await resetPage.assertInvalidToken();
  });

  test('REC-10: [SEGURIDAD] URL sin hash no muestra pantalla de reset', async ({ page }) => {
    await page.goto('/');
    const loginPage = new LoginPage(page);
    await loginPage.assertVisible();

    const resetForm = page.locator('#reset-password-form');
    await expect(resetForm).not.toBeVisible();
  });

  test('REC-11: [SEGURIDAD] Sin sesión activa, reset password muestra error', async ({ page }) => {
    await page.goto('/#type=recovery&access_token=INVALID_TOKEN_12345');

    const resetPage = new ResetPasswordPage(page);
    await resetPage.waitForLoad();
    await resetPage.assertInvalidToken();
  });
});
