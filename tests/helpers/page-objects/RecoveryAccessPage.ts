import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Pantalla Intermedia de Acceso a Recuperación
 * (PantallaAccesoRecuperacionContrasena.tsx)
 */
export class RecoveryAccessPage {
  readonly page: Page;
  readonly continueButton: Locator;
  readonly backButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.continueButton = page.locator('#recovery-access-continue-btn');
    this.backButton = page.locator('#recovery-access-back-btn');
    this.errorMessage = page.locator('.bg-red-500\\/10');
  }

  async waitForLoad() {
    await this.continueButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async assertVisible() {
    await expect(this.continueButton).toBeVisible();
    await expect(this.page.locator('h1:has-text("Continuar recuperación")')).toBeVisible();
  }

  async clickContinue() {
    await this.continueButton.click();
  }

  async clickBack() {
    await this.backButton.click();
  }

  async assertError(text: string) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(text);
  }
}
