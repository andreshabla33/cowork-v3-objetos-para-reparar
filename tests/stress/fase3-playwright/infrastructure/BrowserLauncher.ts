/**
 * @module tests/stress/fase3-playwright/infrastructure/BrowserLauncher
 *
 * Lanza Chromium con flags oficiales para:
 *   - Aceptar permisos de media automáticamente (no bloquea tests).
 *   - Usar cámara/micrófono falsos (archivos Y4M/WAV en lugar de hardware).
 *   - Permitir autoplay de AudioContext sin user gesture.
 *
 * Adicionalmente soporta perfiles de hardware simulado vía CDP:
 *   - 'desktop': sin throttling (default)
 *   - 'laptop':  CDP CPU rate 2× (laptop modesto)
 *   - 'iris-xe': CDP CPU rate 2.5× + SwiftShader + heap 2GB (replica
 *                el peor caso Intel Iris Xe + ANGLE D3D11 observado en
 *                logs reales). Calibración: laptop usuario rinde ~27 FPS
 *                vs PC potente ~60 FPS → throttle ~2.2× = 2.5 con margen.
 *
 * Flags Chromium oficiales:
 *   https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc
 *   https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/chrome_switches.cc
 *
 * CDP Emulation.setCPUThrottlingRate:
 *   https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
 *
 * Clean Architecture: Infrastructure — depende de Playwright concreto.
 *
 * Precondición: `pnpm add -D @playwright/test` antes de ejecutar.
 */

import type { Browser, BrowserContext, Page } from 'playwright';

export type HardwareProfile = 'desktop' | 'laptop' | 'iris-xe';

export interface BrowserLauncherConfig {
  readonly headless: boolean;
  /** Path al archivo .y4m para fake video capture. */
  readonly fakeVideoPath: string;
  /** Path al archivo .wav para fake audio capture. */
  readonly fakeAudioPath: string;
  /** URL del espacio 3D a cargar (dev o prod). */
  readonly baseUrl: string;
  /** Perfil de hardware a simular. Default: 'desktop'. */
  readonly profile?: HardwareProfile;
  /**
   * Path opcional a storageState.json (creado por global.setup.ts).
   * Si se provee, el context reutiliza la sesión auth → no hay login form
   * intermedio que oculte el espacio 3D al test.
   */
  readonly storageStatePath?: string;
}

interface ProfileConfig {
  /** CDP CPU throttling rate (1 = sin throttle, N = N× más lento). */
  cpuRate: number;
  /** Chromium flags adicionales para el perfil. */
  extraArgs: string[];
}

const PROFILES: Record<HardwareProfile, ProfileConfig> = {
  desktop: {
    cpuRate: 1,
    extraArgs: [],
  },
  laptop: {
    cpuRate: 2,
    extraArgs: [],
  },
  'iris-xe': {
    cpuRate: 2.5,
    extraArgs: [
      // SwiftShader ANGLE: software rendering por GPU (simula GPU integrada
      // saturada). Sin esto, la GPU del PC potente compensa el CPU throttle.
      // Ref: https://chromium.googlesource.com/angle/angle/+/main/doc/RendererPlatforms.md
      '--use-angle=swiftshader',
      // V8 heap límite 2GB — similar a laptop con 8GB RAM compartida con OS.
      '--js-flags=--max-old-space-size=2048',
    ],
  },
};

export class BrowserLauncher {
  private browser: Browser | null = null;

  constructor(private readonly config: BrowserLauncherConfig) {}

  async launch(): Promise<Browser> {
    if (this.browser) return this.browser;

    const playwright = await import('playwright').catch((err) => {
      throw new Error(
        `Playwright no está instalado. Ejecutá primero: pnpm add -D @playwright/test && pnpm exec playwright install chromium\n\n` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    const profile = this.config.profile ?? 'desktop';
    const profileConfig = PROFILES[profile];

    this.browser = await playwright.chromium.launch({
      headless: this.config.headless,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${this.config.fakeVideoPath}`,
        `--use-file-for-fake-audio-capture=${this.config.fakeAudioPath}`,
        '--autoplay-policy=no-user-gesture-required',
        '--disable-gpu-sandbox',
        ...profileConfig.extraArgs,
      ],
    });
    return this.browser;
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.launch();
    return browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: { width: 1280, height: 720 },
      ...(this.config.storageStatePath
        ? { storageState: this.config.storageStatePath }
        : {}),
    });
  }

  /**
   * Crea una página nueva y aplica el throttling CDP del profile actual.
   * El throttling es PER-PAGE (no global) — cada page debe configurarlo.
   */
  async newPage(): Promise<Page> {
    const ctx = await this.newContext();
    const page = await ctx.newPage();

    const profile = this.config.profile ?? 'desktop';
    const profileConfig = PROFILES[profile];

    // Aplicar CPU throttle ANTES del navigation — si llega después de
    // page.goto, el primer paint ya está optimizado y el throttle no
    // afecta al render inicial (que es lo que queremos medir).
    if (profileConfig.cpuRate > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: profileConfig.cpuRate,
      });
    }

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
