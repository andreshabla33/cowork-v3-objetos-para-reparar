import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Dashboard principal
 */
export class DashboardPage {
  readonly page: Page;
  readonly workspaceCards: Locator;
  readonly createWorkspaceButton: Locator;
  readonly loadingSpinner: Locator;
  readonly navbar: Locator;
  readonly userAvatar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.workspaceCards = page.locator('[data-testid="workspace-card"]');
    this.createWorkspaceButton = page.locator('button:has-text("Crear"), button:has-text("crear")');
    this.loadingSpinner = page.locator('.animate-spin');
    this.navbar = page.locator('nav, [role="navigation"]');
    this.userAvatar = page.locator('[data-testid="user-avatar"]');
  }

  async waitForLoad() {
    // Esperar a que desaparezca el spinner de carga
    await this.loadingSpinner.first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
    // Esperar un momento para que se renderice el contenido
    await this.page.waitForTimeout(1_000);
  }

  async assertVisible() {
    // El dashboard debería estar visible (no login screen)
    const loginInput = this.page.locator('input[name="email"]');
    await expect(loginInput).not.toBeVisible({ timeout: 10_000 });
  }

  async getWorkspaceCount(): Promise<number> {
    return this.workspaceCards.count();
  }

  async enterFirstWorkspace() {
    const firstCard = this.workspaceCards.first();
    await firstCard.click();
    await this.page.waitForTimeout(2_000);
  }

  async enterWorkspaceByName(name: string) {
    const card = this.page.locator(`text=${name}`).first();
    await card.click();
    await this.page.waitForTimeout(2_000);
  }
}
