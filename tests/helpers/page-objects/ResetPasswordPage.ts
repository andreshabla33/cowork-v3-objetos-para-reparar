import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Pantalla de Nueva Contraseña (Reset Password)
 */
export class ResetPasswordPage {
  readonly page: Page;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly form: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly invalidTokenMessage: Locator;
  readonly goLoginButton: Locator;
  readonly requestNewLinkButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newPasswordInput = page.locator('#reset-new-password');
    this.confirmPasswordInput = page.locator('#reset-confirm-password');
    this.submitButton = page.locator('#reset-submit-btn');
    this.form = page.locator('#reset-password-form');
    this.successMessage = page.locator('h1:has-text("Contraseña actualizada")');
    this.errorMessage = page.locator('.bg-red-500\\/10');
    this.invalidTokenMessage = page.locator('h1:has-text("inválido"), h1:has-text("expirado"), h1:has-text("inv")');
    this.goLoginButton = page.locator('#reset-go-login-btn');
    this.requestNewLinkButton = page.locator('#reset-request-new-link');
  }

  async waitForLoad() {
    // Esperar a que el componente procese el hash (máx 5s)
    await this.page.waitForTimeout(4_000);
  }

  async assertFormVisible() {
    await expect(this.form).toBeVisible({ timeout: 8_000 });
    await expect(this.newPasswordInput).toBeVisible();
    await expect(this.confirmPasswordInput).toBeVisible();
  }

  async assertInvalidToken() {
    // El token inválido/expirado debe mostrar el mensaje de error de token
    // y NO mostrar el formulario de nueva contraseña
    const errorEl = this.page.locator(
      'h1:has-text("inválido"), h1:has-text("expirado"), h1:has-text("Enlace")'
    );
    await expect(errorEl).toBeVisible({ timeout: 8_000 });

    // El formulario NO debe ser visible
    await expect(this.form).not.toBeVisible();
  }

  async assertSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 10_000 });
  }

  async fillNewPassword(password: string, confirm: string) {
    await this.newPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(confirm);
  }

  async submit() {
    await this.submitButton.click();
  }

  async assertError(text?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (text) {
      await expect(this.errorMessage).toContainText(text);
    }
  }
}
