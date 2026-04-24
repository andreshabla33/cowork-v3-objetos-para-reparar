/**
 * @module tests/stress/fase3-playwright/scripts/run-e2e-stress
 *
 * Entry point de Fase 3. Lanza N clientes Playwright simultáneos ejecutando
 * el journey canónico del plan 2026-04-24.
 *
 * Uso:
 *   # 1. Generar fake assets (ver generate-fake-assets.sh)
 *   bash tests/stress/fase3-playwright/scripts/generate-fake-assets.sh
 *
 *   # 2. Instalar Playwright
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 *   # 3. Ejecutar
 *   E2E_BASE_URL=http://localhost:5173 \
 *   E2E_CONCURRENCY=10 \
 *   E2E_TOTAL_JOURNEYS=10 \
 *   E2E_HEADLESS=true \
 *   npx tsx tests/stress/fase3-playwright/scripts/run-e2e-stress.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDefaultJourney } from '../domain/ClientJourneyScript';
import { DEFAULT_E2E_SLOS } from '../domain/E2ESlos';
import { JourneyOrchestrator } from '../application/JourneyOrchestrator';
import { BrowserLauncher } from '../infrastructure/BrowserLauncher';
import { PlaywrightJourneyExecutor } from '../infrastructure/PlaywrightJourneyExecutor';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '..', '..', 'assets');
const VIDEO_PATH = join(ASSETS_DIR, 'fake-cam-640x480.y4m');
const AUDIO_PATH = join(ASSETS_DIR, 'fake-mic.wav');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[e2e-stress] missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  // Validar fake assets.
  if (!existsSync(VIDEO_PATH) || !existsSync(AUDIO_PATH)) {
    console.error(`[e2e-stress] missing fake assets. Ejecutá primero: bash tests/stress/fase3-playwright/scripts/generate-fake-assets.sh`);
    process.exit(1);
  }

  const baseUrl = requireEnv('E2E_BASE_URL');
  const concurrency = intFromEnv('E2E_CONCURRENCY', 10);
  const totalJourneys = intFromEnv('E2E_TOTAL_JOURNEYS', concurrency);
  const headless = (process.env.E2E_HEADLESS ?? 'true').toLowerCase() !== 'false';
  const isLaptopProfile = (process.env.E2E_PROFILE ?? 'desktop').toLowerCase() === 'laptop';

  console.log(`[e2e-stress] config:`, {
    baseUrl,
    concurrency,
    totalJourneys,
    headless,
    profile: isLaptopProfile ? 'laptop' : 'desktop',
  });

  const launcher = new BrowserLauncher({
    headless,
    fakeVideoPath: VIDEO_PATH,
    fakeAudioPath: AUDIO_PATH,
    baseUrl,
  });

  const executor = new PlaywrightJourneyExecutor(launcher);
  const orchestrator = new JourneyOrchestrator(executor, DEFAULT_E2E_SLOS, isLaptopProfile);

  // Construir N journeys con credenciales sintéticas bot_01..bot_N.
  const scripts = Array.from({ length: totalJourneys }, (_, i) =>
    buildDefaultJourney(
      `bot_${String(i + 1).padStart(2, '0')}@stress.local`,
      'StressTestPassword123!',
      i + 1,
    ),
  );

  const report = await orchestrator.runAll(scripts, concurrency);
  await launcher.close();

  const runsDir = join(__dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const outPath = join(runsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n[e2e-stress] RESUMEN:');
  console.log(`  Total journeys: ${report.totalJourneys}`);
  console.log(`  Concurrency: ${report.concurrency}`);
  console.log(`  Verdict: ${report.verdict.pass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  Journeys all-steps-ok: ${report.verdict.passedJourneys} / ${report.verdict.totalJourneys}`);
  if (report.verdict.reasons.length > 0) {
    console.log(`  Reasons: ${report.verdict.reasons.join(' | ')}`);
  }
  console.log(`\n  Report JSON: ${outPath}`);

  process.exit(report.verdict.pass ? 0 : 1);
}

main().catch((err) => {
  console.error('[e2e-stress] fatal:', err);
  process.exit(2);
});
