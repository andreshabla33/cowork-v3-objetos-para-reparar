import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Pantalla de Login / Registro
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly nameInput: Locator;
  readonly submitButton: Locator;
  readonly googleButton: Locator;
  readonly guestButton: Locator;
  readonly toggleRegisterLink: Locator;
  readonly errorMessage: Locator;
  readonly authFeedback: Locator;
  readonly invitationBanner: Locator;
  readonly helpLink: Locator;
  readonly title: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.nameInput = page.locator('input[name="name"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.googleButton = page.locator('button:has-text("Google")');
    this.guestButton = page.locator('button:has-text("Invitado")');
    this.toggleRegisterLink = page.locator('button:has-text("Crea una aquí"), button:has-text("Inicia Sesión")');
    this.errorMessage = page.locator('.bg-red-500\\/10');
    this.authFeedback = page.locator('.bg-green-500\\/10, .bg-red-500\\/10').first();
    this.invitationBanner = page.locator('.bg-blue-500\\/10');
    this.helpLink = page.locator('button:has-text("Problemas para entrar")');
    this.title = page.locator('h1:has-text("COWORK")');
  }

  async goto() {
    await this.page.goto('/');
    await this.emailInput.waitFor({ timeout: 15_000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async switchToRegister() {
    await this.page.click('button:has-text("Crea una aquí")');
    await this.nameInput.waitFor({ timeout: 5_000 });
  }

  async switchToLogin() {
    await this.page.click('button:has-text("Inicia Sesión")');
  }

  async register(name: string, email: string, password: string) {
    await this.switchToRegister();
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginAsGuest() {
    await this.guestButton.click();
  }

  async assertVisible() {
    await expect(this.title).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  async assertError(text?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (text) {
      await expect(this.errorMessage).toContainText(text);
    }
  }

  async assertNoError() {
    await expect(this.errorMessage).not.toBeVisible();
  }
}
