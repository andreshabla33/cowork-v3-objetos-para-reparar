import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Workspace (espacio virtual 3D)
 */
export class WorkspacePage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly chatPanel: Locator;
  readonly chatInput: Locator;
  readonly chatSendButton: Locator;
  readonly bottomBar: Locator;
  readonly navbar: Locator;
  readonly membersPanel: Locator;
  readonly taskBoard: Locator;
  readonly meetingRooms: Locator;
  readonly avatarCustomizer: Locator;
  readonly loadingOverlay: Locator;
  readonly miniMode: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas').first();
    this.chatPanel = page.locator('[data-testid="chat-panel"]');
    this.chatInput = page.locator('input[placeholder*="mensaje"], textarea[placeholder*="mensaje"], input[placeholder*="Escrib"]');
    this.chatSendButton = page.locator('button[aria-label="Enviar"], button:has-text("Enviar")');
    this.bottomBar = page.locator('[data-testid="bottom-bar"]');
    this.navbar = page.locator('nav, [role="navigation"]');
    this.membersPanel = page.locator('[data-testid="members-panel"]');
    this.taskBoard = page.locator('[data-testid="task-board"]');
    this.meetingRooms = page.locator('[data-testid="meeting-rooms"]');
    this.avatarCustomizer = page.locator('[data-testid="avatar-customizer"]');
    this.loadingOverlay = page.locator('.animate-spin');
    this.miniMode = page.locator('[data-testid="mini-mode"]');
  }

  async waitForLoad() {
    // Esperar a que el canvas 3D se renderice
    await this.canvas.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      // Si no hay canvas, al menos esperar que desaparezca el loading
    });
    await this.loadingOverlay.first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }

  async assertCanvasVisible() {
    await expect(this.canvas).toBeVisible({ timeout: 20_000 });
  }

  async sendChatMessage(message: string) {
    await this.chatInput.fill(message);
    // Intentar enviar con Enter o con botón
    await this.chatInput.press('Enter');
  }

  async assertChatMessageVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async openTab(tabName: string) {
    await this.page.click(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`);
    await this.page.waitForTimeout(500);
  }

  async getOnlineUserCount(): Promise<number> {
    const badges = this.page.locator('[data-testid="online-count"], .online-count');
    const text = await badges.first().textContent().catch(() => '0');
    return parseInt(text || '0', 10);
  }
}
