/**
 * @module tests/stress/fase3-playwright/infrastructure/MetricsCollector
 *
 * Sample métricas de un browser Playwright durante un journey:
 *  - window.__cowork_metrics (calls, triangles, geometries, textures, programs)
 *  - CDP Performance.getMetrics() (JSHeapUsedSize, JSHeapTotalSize)
 *  - Console logs del logger interno (Frame stats, alertas)
 *
 * Diseño:
 *  - sampler asíncrono cada `sampleIntervalMs`.
 *  - Acumula en array, calcula P99 / mean / max al stop().
 *  - Clean Architecture: Infrastructure — depende de Playwright/CDP.
 *
 * Refs oficiales:
 *  - https://chromedevtools.github.io/devtools-protocol/tot/Performance/#method-getMetrics
 *  - https://playwright.dev/docs/api/class-cdpsession
 *  - https://playwright.dev/docs/api/class-page#page-event-console
 */

import type { CDPSession, Page } from 'playwright';

export interface MetricSample {
  readonly ts: number;
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly jsHeapUsedMb: number;
}

export interface CollectedMetrics {
  readonly samples: readonly MetricSample[];
  /** Tiempo desde launch de la page hasta primer "scene ready" log. */
  readonly sceneReadyMs: number | null;
  /** Cantidad de WebGL context lost events. */
  readonly contextLostCount: number;
  /** Logs interesantes capturados (warnings, errors). */
  readonly notableLogs: readonly { level: string; text: string; ts: number }[];
}

export interface MetricsCollectorOptions {
  /** ms entre samples. Default 1000 (1Hz, low overhead). */
  readonly sampleIntervalMs?: number;
}

export class MetricsCollector {
  private cdp: CDPSession | null = null;
  private samples: MetricSample[] = [];
  private notableLogs: { level: string; text: string; ts: number }[] = [];
  private contextLostCount = 0;
  private sceneReadyMs: number | null = null;
  private startTs = 0;
  private sampleHandle: ReturnType<typeof setInterval> | null = null;
  private consoleHandler: ((msg: { type: () => string; text: () => string }) => void) | null = null;
  private contextLostHandler: (() => void) | null = null;

  constructor(
    private readonly page: Page,
    private readonly opts: MetricsCollectorOptions = {},
  ) {}

  async start(): Promise<void> {
    this.startTs = Date.now();
    this.samples = [];
    this.notableLogs = [];
    this.contextLostCount = 0;
    this.sceneReadyMs = null;

    // CDP session — Performance.getMetrics para heap.
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.cdp.send('Performance.enable');

    // Listen consola para "scene ready" + warnings/errors.
    this.consoleHandler = (msg) => {
      const text = msg.text();
      const type = msg.type();

      // Capturar "scene ready" del logger interno.
      if (this.sceneReadyMs === null && text.includes('"msg":"scene ready"')) {
        this.sceneReadyMs = Date.now() - this.startTs;
      }

      // Acumular warnings / errors / leak alerts.
      if (type === 'warning' || type === 'error') {
        this.notableLogs.push({ level: type, text: text.slice(0, 500), ts: Date.now() });
      } else if (text.includes('LEAK SUSPECTED') || text.includes('performance alert')) {
        this.notableLogs.push({ level: 'alert', text: text.slice(0, 500), ts: Date.now() });
      }
    };
    this.page.on('console', this.consoleHandler as never);

    // WebGL context lost listener.
    this.contextLostHandler = () => {
      this.contextLostCount++;
    };
    await this.page.exposeBinding('__cowork_onContextLost', () => {
      this.contextLostCount++;
    });
    await this.page.addInitScript(() => {
      // Listener que se inyecta antes del load del bundle.
      window.addEventListener(
        'webglcontextlost',
        () => {
          (window as Window & { __cowork_onContextLost?: () => void }).__cowork_onContextLost?.();
        },
        true,
      );
    });

    // Sampler interval.
    const intervalMs = this.opts.sampleIntervalMs ?? 1000;
    this.sampleHandle = setInterval(() => {
      void this.sampleOnce();
    }, intervalMs);
  }

  private async sampleOnce(): Promise<void> {
    if (!this.cdp) return;
    try {
      // window metrics
      const rendererMetrics = await this.page.evaluate(() => {
        return (window as Window & { __cowork_metrics?: Record<string, number> }).__cowork_metrics ?? null;
      });

      // CDP performance metrics
      const perf = await this.cdp.send('Performance.getMetrics');
      const heapBytes =
        perf.metrics.find((m: { name: string; value: number }) => m.name === 'JSHeapUsedSize')?.value ?? 0;
      const heapMb = heapBytes / (1024 * 1024);

      if (rendererMetrics) {
        this.samples.push({
          ts: Date.now(),
          calls: Number(rendererMetrics.calls ?? 0),
          triangles: Number(rendererMetrics.triangles ?? 0),
          geometries: Number(rendererMetrics.geometries ?? 0),
          textures: Number(rendererMetrics.textures ?? 0),
          programs: Number(rendererMetrics.programs ?? 0),
          jsHeapUsedMb: heapMb,
        });
      }
    } catch {
      // Page navigated or closed — ignore silently.
    }
  }

  async stop(): Promise<CollectedMetrics> {
    if (this.sampleHandle !== null) {
      clearInterval(this.sampleHandle);
      this.sampleHandle = null;
    }
    if (this.consoleHandler) {
      try {
        this.page.off('console', this.consoleHandler as never);
      } catch {
        // page closed
      }
      this.consoleHandler = null;
    }
    if (this.cdp) {
      try {
        await this.cdp.detach();
      } catch {
        // page closed
      }
      this.cdp = null;
    }
    return {
      samples: this.samples,
      sceneReadyMs: this.sceneReadyMs,
      contextLostCount: this.contextLostCount,
      notableLogs: this.notableLogs,
    };
  }
}

// ─── Helpers de agregación (pure functions, testables) ──────────────────────

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function summarizeMetrics(metrics: CollectedMetrics): {
  drawCallsP99: number;
  trianglesP99: number;
  geometriesP99: number;
  jsHeapMbP99: number;
  fpsApprox: number;
} {
  const samples = metrics.samples;
  if (samples.length < 2) {
    return { drawCallsP99: 0, trianglesP99: 0, geometriesP99: 0, jsHeapMbP99: 0, fpsApprox: 0 };
  }

  const elapsedMs = samples[samples.length - 1].ts - samples[0].ts;
  const fpsApprox = elapsedMs > 0 ? (samples.length / (elapsedMs / 1000)) : 0;

  return {
    drawCallsP99: percentile(samples.map((s) => s.calls), 99),
    trianglesP99: percentile(samples.map((s) => s.triangles), 99),
    geometriesP99: percentile(samples.map((s) => s.geometries), 99),
    jsHeapMbP99: percentile(samples.map((s) => s.jsHeapUsedMb), 99),
    // fpsApprox es solo "sample rate del collector" — para FPS real
    // medir frame-time vía requestAnimationFrame del browser.
    fpsApprox,
  };
}
