import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Pantalla de Recuperación de Contraseña (Solicitud de Email)
 */
export class ForgotPasswordPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly backButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly form: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('#forgot-email-input');
    this.submitButton = page.locator('#forgot-submit-btn');
    this.backButton = page.locator('#forgot-back-btn');
    this.successMessage = page.locator('p:has-text("Correo enviado"), p:has-text("Revisa tu bandeja")');
    this.errorMessage = page.locator('.bg-red-500\\/10');
    this.form = page.locator('#forgot-password-form');
  }

  async waitForLoad() {
    await this.emailInput.waitFor({ timeout: 10_000 });
  }

  async assertVisible() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async submitEmail(email: string) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
    // Esperar respuesta (loading state)
    await this.page.waitForTimeout(3_000);
  }

  async assertEmailSent() {
    // Esperar al mensaje de éxito (puede tardar por la llamada a Supabase)
    const sentTitle = this.page.locator('p:has-text("Correo enviado"), p.text-emerald-400');
    await expect(sentTitle).toBeVisible({ timeout: 10_000 });
  }

  async assertError(text?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (text) {
      await expect(this.errorMessage).toContainText(text);
    }
  }

  async clickBack() {
    await this.backButton.click();
  }
}
