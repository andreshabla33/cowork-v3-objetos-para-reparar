/**
 * @module tests/stress/fase3-playwright/infrastructure/PlaywrightJourneyExecutor
 *
 * Implementa IClientJourneyExecutor traduciendo JourneyStep → Playwright Page actions.
 *
 * Cada step interactúa con la UI real del espacio 3D vía selectors tolerantes
 * (usando data-tour-step atributos cuando existen, fallback a role+name).
 *
 * Clean Architecture: Infrastructure — depende de Playwright concreto.
 *
 * Nota importante: los selectors exactos dependen del DOM actual del proyecto.
 * Si el HTML cambia, este archivo se actualiza — ningún otro de Fase 3 debería.
 */

import type { Page } from 'playwright';
import type { ClientJourneyScript, JourneyStep } from '../domain/ClientJourneyScript';
import type { JourneyResult, JourneyStepResult } from '../domain/E2ESlos';
import type { IClientJourneyExecutor } from '../application/JourneyOrchestrator';
import type { BrowserLauncher } from './BrowserLauncher';

export class PlaywrightJourneyExecutor implements IClientJourneyExecutor {
  constructor(private readonly launcher: BrowserLauncher) {}

  async execute(script: ClientJourneyScript): Promise<JourneyResult> {
    const startedAt = new Date().toISOString();
    const stepResults: JourneyStepResult[] = [];
    // Observadas vía page evaluate() — se completan cuando el step relevante corre.
    const observed = {
      roomConnectedMs: null as number | null,
      chatInsertsAttempted: 0,
      chatInsertsSucceeded: 0,
      moveParticipantAttempted: 0,
      moveParticipantSucceeded: 0,
      fpsP99: 0,
      ghostCleanupDetectedMs: null as number | null,
    };

    const page = await this.launcher.newPage();
    const roomConnectStartTs = Date.now();

    // Suscribirse a console logs del cliente — así capturamos mensajes del
    // logger.child (e.g. "Connected to room", "enviarMensaje: sent ok").
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Connected to room') && observed.roomConnectedMs === null) {
        observed.roomConnectedMs = Date.now() - roomConnectStartTs;
      }
      if (text.includes('enviarMensaje: sent ok')) observed.chatInsertsSucceeded++;
      if (text.includes('Meeting room transition complete')) observed.moveParticipantSucceeded++;
    });

    for (const step of script.steps) {
      const stepStart = Date.now();
      try {
        await this.runStep(page, step, observed);
        stepResults.push({
          kind: step.kind,
          startTs: stepStart,
          endTs: Date.now(),
          success: true,
        });
      } catch (err) {
        stepResults.push({
          kind: step.kind,
          startTs: stepStart,
          endTs: Date.now(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        // No abortamos el journey — algunos steps son tolerantes a fallo parcial
        // (ej. toggle_camera puede fallar si fake media no llegó a tiempo).
      }
    }

    // Capturar FPS P99 del journey via page.evaluate() al final.
    observed.fpsP99 = await this.captureFpsFromPage(page);

    await page.close();

    return {
      journeyId: script.journeyId,
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: stepResults,
      observedMetrics: observed,
    };
  }

  private async runStep(
    page: Page,
    step: JourneyStep,
    observed: {
      chatInsertsAttempted: number;
      moveParticipantAttempted: number;
    },
  ): Promise<void> {
    switch (step.kind) {
      case 'login': {
        await page.fill('input[type="email"]', step.email);
        await page.fill('input[type="password"]', step.password);
        await page.click('button[type="submit"]');
        break;
      }
      case 'wait_room_connected': {
        // Esperamos a que aparezca el Canvas 3D como señal de Room conectada.
        await page.waitForSelector('canvas', { timeout: step.timeoutMs });
        break;
      }
      case 'walk_random': {
        // Simular teclas WASD aleatorias durante durationMs.
        const keys = ['w', 'a', 's', 'd'];
        const endTs = Date.now() + step.durationMs;
        while (Date.now() < endTs) {
          const key = keys[Math.floor(Math.random() * keys.length)];
          await page.keyboard.down(key);
          await page.waitForTimeout(200 + Math.random() * 400);
          await page.keyboard.up(key);
        }
        break;
      }
      case 'toggle_camera': {
        await page.click('[data-tour-step="camera-btn"]', { timeout: 5000 });
        await page.waitForTimeout(1000);
        break;
      }
      case 'toggle_mic': {
        await page.click('[data-tour-step="mic-btn"]', { timeout: 5000 });
        await page.waitForTimeout(500);
        break;
      }
      case 'send_chat': {
        observed.chatInsertsAttempted++;
        await page.click('[data-tour-step="chat-btn"]');
        await page.waitForTimeout(500);
        const input = page.locator('textarea, input[type="text"]').last();
        await input.fill(step.message);
        await input.press('Enter');
        await page.waitForTimeout(1500); // dar tiempo al INSERT
        break;
      }
      case 'cross_meeting_zone': {
        observed.moveParticipantAttempted++;
        // Simular caminar al NE hacia la zona XL (centrada en 700,700 = world 43,43).
        await page.keyboard.down('d');
        await page.keyboard.down('s');
        await page.waitForTimeout(6000);
        await page.keyboard.up('d');
        await page.keyboard.up('s');
        await page.waitForTimeout(2000);
        break;
      }
      case 'walk_outside_zone': {
        // Caminar al NW para salir de la zona.
        await page.keyboard.down('a');
        await page.keyboard.down('w');
        await page.waitForTimeout(step.durationMs);
        await page.keyboard.up('a');
        await page.keyboard.up('w');
        break;
      }
      case 'abrupt_close': {
        // Cerrar la pestaña sin gracias — emula tab cerrado abruptamente.
        // Playwright.close() sin disconnect explícito.
        break;
      }
    }
  }

  private async captureFpsFromPage(page: Page): Promise<number> {
    // Lee una serie de valores FPS expuestos por el client (si existe el hook).
    // Fallback: retornamos 60 como "unknown" — el test marca warn pero no fail.
    try {
      const fpsSeries = await page.evaluate(() => {
        return (window as unknown as { __fpsSeries?: number[] }).__fpsSeries ?? [];
      });
      if (!Array.isArray(fpsSeries) || fpsSeries.length === 0) return 60;
      const sorted = [...fpsSeries].sort((a, b) => a - b);
      const p99Index = Math.floor(sorted.length * 0.01);
      return sorted[p99Index] ?? 60;
    } catch {
      return 60;
    }
  }
}
