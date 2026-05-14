/**
 * @module tests/stress/fase3-playwright/scripts/run-stress-iris-xe
 *
 * Entry point para test de stress simulando Intel Iris Xe (laptop básico)
 * desde una PC potente. Usa CDP CPU throttle + ANGLE SwiftShader para
 * replicar el peor caso observado en logs reales.
 *
 * Uso:
 *   pnpm dev  # en otra terminal
 *   E2E_BASE_URL=http://localhost:5173 pnpm test:stress:iris-xe
 *
 * Env vars opcionales:
 *   E2E_BASE_URL   → URL del espacio (default http://localhost:5173)
 *   E2E_DURATION_S → duración del journey en segundos (default 30)
 *   E2E_HEADLESS   → 'false' para ver browser (debug). Default true.
 *
 * Salida:
 *   tests/stress/runs/iris-xe-<ISO>.json — métricas + verdict SLO
 *   exit 0 → todos SLOs pass
 *   exit 1 → al menos 1 SLO fail (CI bloqueante)
 *   exit 2 → error fatal (config, browser launch)
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserLauncher } from '../infrastructure/BrowserLauncher';
import { MetricsCollector, summarizeMetrics } from '../infrastructure/MetricsCollector';
import {
  DEFAULT_E2E_SLOS,
  evaluateE2EAggregate,
  type JourneyResult,
} from '../domain/E2ESlos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '..', '..', 'assets');
const VIDEO_PATH = join(ASSETS_DIR, 'fake-cam-640x480.y4m');
const AUDIO_PATH = join(ASSETS_DIR, 'fake-mic.wav');
const RUNS_DIR = resolve(__dirname, '..', '..', 'runs');

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main(): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const durationS = intEnv('E2E_DURATION_S', 30);
  const headless = (process.env.E2E_HEADLESS ?? 'true').toLowerCase() !== 'false';

  console.log('[stress:iris-xe] config:', {
    baseUrl,
    durationS,
    headless,
    profile: 'iris-xe',
    cpuThrottle: '2.5x',
    gpu: 'SwiftShader',
  });

  if (!existsSync(VIDEO_PATH) || !existsSync(AUDIO_PATH)) {
    console.warn('[stress:iris-xe] fake assets missing, generating placeholders...');
    if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
    // Bash generator no disponible en Windows — usar fallback Node:
    // crea archivos vacíos (Chromium tolera; el journey no requiere video real).
    const { writeFileSync: writeBuf } = await import('node:fs');
    writeBuf(VIDEO_PATH, Buffer.from('YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\n'));
    writeBuf(AUDIO_PATH, Buffer.alloc(44)); // WAV header dummy
  }

  // Auth state guardado por `pnpm exec playwright test --project=setup`.
  // Si no existe, el test corre sin login → el espacio 3D no carga.
  const authStatePath = resolve(__dirname, '..', '..', '..', '.auth', 'user.json');
  const useAuth = existsSync(authStatePath);
  if (!useAuth) {
    console.warn(
      '[stress:iris-xe] WARN: tests/.auth/user.json no existe. Corré primero:\n' +
        '   pnpm exec playwright test --project=setup\n' +
        'Sin auth, el espacio 3D no carga → métricas vacías.',
    );
  }

  const launcher = new BrowserLauncher({
    headless,
    fakeVideoPath: VIDEO_PATH,
    fakeAudioPath: AUDIO_PATH,
    baseUrl,
    profile: 'iris-xe',
    storageStatePath: useAuth ? authStatePath : undefined,
  });

  let exitCode = 0;
  const startedAt = new Date().toISOString();

  try {
    const page = await launcher.newPage();
    const collector = new MetricsCollector(page, { sampleIntervalMs: 1000 });
    await collector.start();

    console.log(`[stress:iris-xe] page loaded — esperando que el espacio 3D se monte...`);

    // Esperar a que window.__cowork_metrics aparezca (significa VirtualSpace3D
    // montado + primer frame stats publicado). Timeout 30s.
    try {
      await page.waitForFunction(
        () => Boolean((window as Window & { __cowork_metrics?: unknown }).__cowork_metrics),
        { timeout: 30_000 },
      );
      console.log(`[stress:iris-xe] espacio 3D activo — sampling ${durationS}s...`);
    } catch {
      const url = page.url();
      const title = await page.title().catch(() => '<no title>');
      const bodyText = await page
        .evaluate(() => document.body?.innerText?.slice(0, 300) ?? '<no body>')
        .catch(() => '<eval failed>');
      console.error(
        `[stress:iris-xe] TIMEOUT: window.__cowork_metrics no apareció en 30s.\n` +
          `   URL final: ${url}\n` +
          `   Title:     ${title}\n` +
          `   Body:      ${bodyText.replace(/\n/g, ' ')}\n` +
          `   ¿Vite dev corre? ¿Workspace pre-seleccionado en auth state?`,
      );
    }

    await page.waitForTimeout(durationS * 1000);

    const collected = await collector.stop();
    const summary = summarizeMetrics(collected);

    const journey: JourneyResult = {
      journeyId: 'iris-xe-baseline',
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: [
        {
          kind: 'load_scene',
          startTs: Date.parse(startedAt),
          endTs: Date.parse(startedAt) + (collected.sceneReadyMs ?? 0),
          success: collected.sceneReadyMs !== null,
        },
        {
          kind: 'sustain_render',
          startTs: Date.parse(startedAt) + (collected.sceneReadyMs ?? 0),
          endTs: Date.now(),
          success: collected.contextLostCount === 0,
        },
      ],
      observedMetrics: {
        roomConnectedMs: null,
        chatInsertsAttempted: 0,
        chatInsertsSucceeded: 0,
        moveParticipantAttempted: 0,
        moveParticipantSucceeded: 0,
        fpsP99: 0, // FPS real requiere instrumentación adicional (rAF)
        ghostCleanupDetectedMs: null,
        drawCallsP99: summary.drawCallsP99,
        jsHeapMbP99: summary.jsHeapMbP99,
        sceneReadyMs: collected.sceneReadyMs ?? undefined,
      },
    };

    const verdict = evaluateE2EAggregate([journey], DEFAULT_E2E_SLOS, 'iris-xe');

    // Persistir resultado
    if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
    const runPath = join(RUNS_DIR, `iris-xe-${Date.now()}.json`);
    writeFileSync(
      runPath,
      JSON.stringify(
        {
          profile: 'iris-xe',
          startedAt,
          finishedAt: new Date().toISOString(),
          slos: DEFAULT_E2E_SLOS,
          verdict,
          journey,
          summary,
          notableLogs: collected.notableLogs,
          contextLostCount: collected.contextLostCount,
        },
        null,
        2,
      ),
    );

    // Stdout resumen
    console.log('\n[stress:iris-xe] RESULTS');
    console.log('═'.repeat(60));
    console.log(`  Verdict:          ${verdict.pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Scene ready:      ${collected.sceneReadyMs ?? 'N/A'} ms`);
    console.log(`  Draw calls P99:   ${summary.drawCallsP99.toFixed(0)}`);
    console.log(`  Triangles P99:    ${summary.trianglesP99.toFixed(0)}`);
    console.log(`  Geometries P99:   ${summary.geometriesP99.toFixed(0)}`);
    console.log(`  JS heap P99:      ${summary.jsHeapMbP99.toFixed(1)} MB`);
    console.log(`  Context lost:     ${collected.contextLostCount}`);
    console.log(`  Notable logs:     ${collected.notableLogs.length}`);
    if (!verdict.pass) {
      console.log('\n  Reasons:');
      for (const r of verdict.reasons) console.log(`    • ${r}`);
    }
    console.log(`\n  Full report: ${runPath}\n`);

    exitCode = verdict.pass ? 0 : 1;
  } catch (err) {
    console.error('[stress:iris-xe] fatal error:', err);
    exitCode = 2;
  } finally {
    await launcher.close();
    process.exit(exitCode);
  }
}

void main();
