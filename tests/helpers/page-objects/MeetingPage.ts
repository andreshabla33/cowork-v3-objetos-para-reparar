import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object: Gestión de Reuniones
 */
export class MeetingPage {
  readonly page: Page;
  readonly roomsSection: Locator;
  readonly createRoomButton: Locator;
  readonly roomNameInput: Locator;
  readonly submitCreateButton: Locator;
  readonly joinRoomButton: Locator;
  readonly leaveRoomButton: Locator;
  readonly lobbyJoinButton: Locator;
  readonly micToggleButton: Locator;
  readonly camToggleButton: Locator;
  readonly screenShareButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.roomsSection = page.locator('h3:has-text("Salas de Reunión")');
    this.createRoomButton = page.locator('button:has-text("Nueva Sala")');
    this.roomNameInput = page.locator('input[placeholder*="Daily Standup"]');
    this.submitCreateButton = page.locator('button:has-text("Crear Sala")');
    this.joinRoomButton = page.locator('button:has-text("Unirse")');
    this.leaveRoomButton = page.locator('button:has-text("Salir")');
    this.lobbyJoinButton = page.locator('button:has-text("Unirme ahora")');
    this.micToggleButton = page.locator('button[aria-label*="mic"], button:has(svg:has-path[d*="M12 1a3"])'); // Basado en iconos comunes
    this.camToggleButton = page.locator('button[aria-label*="cam"], button:has(svg:has-path[d*="M15 10l4.553-2.276"])');
    this.screenShareButton = page.locator('button[aria-label*="pantalla"], button:has(svg:has-path[d*="M9.75 17L9 20l-1 1h8l-1-1-.75-3"])');
  }

  async waitForLoad() {
    await this.roomsSection.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async createNewRoom(name: string) {
    await this.createRoomButton.click();
    await this.roomNameInput.fill(name);
    await this.submitCreateButton.click();
    // Esperar a que se cree y aparezca en la lista
    await expect(this.page.locator(`text=${name}`)).toBeVisible({ timeout: 10_000 });
  }

  async joinRoom(name: string) {
    const roomRow = this.page.locator(`div:has-text("${name}")`).filter({ has: this.joinRoomButton });
    await roomRow.locator(this.joinRoomButton).click();
  }

  async leaveRoom() {
    await this.leaveRoomButton.click();
  }

  async enterFromLobby(guestName?: string) {
    if (guestName) {
      const nameInput = this.page.locator('input[placeholder*="nombre"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill(guestName);
      }
    }
    await this.lobbyJoinButton.click();
  }

  async assertInMeeting() {
    // Verificar que estamos en la vista de sala (viendo controles de audio/video)
    await expect(this.page.locator('[data-testid="meeting-room"], .meeting-room-container')).toBeVisible({ timeout: 15_000 });
  }

  async toggleMic() {
    await this.micToggleButton.click();
  }

  async toggleCam() {
    await this.camToggleButton.click();
  }

  async toggleScreenShare() {
    await this.screenShareButton.click();
  }
}
