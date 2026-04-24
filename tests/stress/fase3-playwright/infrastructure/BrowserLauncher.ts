/**
 * @module tests/stress/fase3-playwright/infrastructure/BrowserLauncher
 *
 * Lanza Chromium con flags oficiales para:
 *   - Aceptar permisos de media automáticamente (no bloquea tests).
 *   - Usar cámara/micrófono falsos (archivos Y4M/WAV en lugar de hardware).
 *   - Permitir autoplay de AudioContext sin user gesture.
 *
 * Flags documentados en Chromium fuente oficial:
 *   https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc
 *
 * Clean Architecture: Infrastructure — depende de Playwright concreto.
 *
 * Precondición: `npm install --save-dev @playwright/test` antes de ejecutar.
 */

// Nota: este import requiere que @playwright/test esté instalado como devDep.
// Lo dejamos como side-effect para que TS compile aunque no esté presente en
// el build principal — el script de Fase 3 es opt-in.
import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserLauncherConfig {
  readonly headless: boolean;
  /** Path al archivo .y4m para fake video capture. */
  readonly fakeVideoPath: string;
  /** Path al archivo .wav para fake audio capture. */
  readonly fakeAudioPath: string;
  /** URL del espacio 3D a cargar (dev o prod). */
  readonly baseUrl: string;
}

export class BrowserLauncher {
  private browser: Browser | null = null;

  constructor(private readonly config: BrowserLauncherConfig) {}

  async launch(): Promise<Browser> {
    if (this.browser) return this.browser;

    // Import dinámico — evita fallo de build si @playwright/test no está instalado.
    const playwright = await import('playwright').catch((err) => {
      throw new Error(
        `Playwright no está instalado. Ejecutá primero: npm install --save-dev @playwright/test && npx playwright install chromium\n\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    this.browser = await playwright.chromium.launch({
      headless: this.config.headless,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${this.config.fakeVideoPath}`,
        `--use-file-for-fake-audio-capture=${this.config.fakeAudioPath}`,
        '--autoplay-policy=no-user-gesture-required',
        '--disable-gpu-sandbox',
      ],
    });
    return this.browser;
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.launch();
    return browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: { width: 1280, height: 720 },
    });
  }

  async newPage(): Promise<Page> {
    const ctx = await this.newContext();
    const page = await ctx.newPage();
    await page.goto(this.config.baseUrl);
    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
