/**
 * @module tests/stress/fase1-local/scripts/run-fase1-auto
 *
 * Runner automatizado de Fase 1 profile-aware. Lanza Chromium, login, entra al
 * workspace, dispara `__stressRunProfile(name)` dentro del espacio 3D. Polea
 * `__stressDone`, extrae result + verdict + profile name, guarda JSON con
 * sufijo `-<profile>.json` y genera HTML report.
 *
 * Exit codes:
 *   0 — verdict.pass === true
 *   1 — verdict.pass === false (SLO fail)
 *   2 — error fatal (Playwright missing, env missing, canvas timeout, etc.)
 *
 * Uso:
 *   npm run stress:fase1 [-- --profile=smoke|load|soak|stress|spike] [--laptop]
 *
 * Env vars (pueden vivir en .env.stress.local):
 *   FASE1_BASE_URL (req), FASE1_LOGIN_EMAIL (req), FASE1_LOGIN_PASSWORD (req)
 *   FASE1_HEADLESS (opt, default false), FASE1_WARMUP_SEC (opt, default 5)
 *   FASE1_PROFILE (opt, default load) — sobreescrito por --profile si lo pasás
 *   FASE1_NETWORK_PROFILE (opt) — 'fast-3g' aplica CDP throttling (chaos nivel 1)
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import type { Page, CDPSession } from 'playwright';

import type { LoadProfileKind } from '../domain/LoadProfiles';
import { PROFILES, totalDurationSec } from '../domain/LoadProfiles';
import { compareToBaseline } from '../domain/BaselineComparison';
import type { BaselineSnapshot, BaselineVerdict } from '../domain/BaselineComparison';
import { FileBaselineStorage } from '../infrastructure/BaselineStorage';
import { HtmlReportGenerator } from '../infrastructure/HtmlReportGenerator';
import type { StressRunResult, LeakVerdict } from '../domain/LeakDetectionCriteria';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..');
const RUNS_DIR = join(__dirname, '..', 'runs');
const BASELINES_DIR = join(__dirname, '..', 'baselines');

// Auto-carga de .env.stress.local.
loadEnvFileIfPresent(join(ROOT, '.env.stress.local'));

function loadEnvFileIfPresent(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  console.log(`[fase1-auto] env cargadas desde ${path}`);
}

function parseCliArgs(): {
  profileOverride: LoadProfileKind | null;
  laptop: boolean;
  networkProfile: string | null;
  chaosMode: string | null;
} {
  let profileOverride: LoadProfileKind | null = null;
  let laptop = false;
  let networkProfile: string | null = null;
  let chaosMode: string | null = null;
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'profile' && v && (v in PROFILES)) profileOverride = v as LoadProfileKind;
    if (k === 'laptop') laptop = true;
    if (k === 'network' && v) networkProfile = v;
    if (k === 'chaos' && v) chaosMode = v;
  }
  return { profileOverride, laptop, networkProfile, chaosMode };
}

function envOr(name: string, fallback?: string): string {
  const v = process.env[name];
  if (!v) {
    if (fallback !== undefined) return fallback;
    console.error(`[fase1-auto] missing env: ${name}`);
    process.exit(2);
  }
  return v;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeGitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const baseUrl = envOr('FASE1_BASE_URL');
  const email = envOr('FASE1_LOGIN_EMAIL');
  const password = envOr('FASE1_LOGIN_PASSWORD');
  const warmupSec = envInt('FASE1_WARMUP_SEC', 5);
  const headless = (process.env.FASE1_HEADLESS ?? 'false').toLowerCase() !== 'false';

  const cli = parseCliArgs();
  const profileKind: LoadProfileKind = cli.profileOverride
    ?? ((process.env.FASE1_PROFILE as LoadProfileKind | undefined) && (process.env.FASE1_PROFILE! in PROFILES)
      ? process.env.FASE1_PROFILE as LoadProfileKind
      : 'load');
  const networkProfile = cli.networkProfile ?? process.env.FASE1_NETWORK_PROFILE ?? null;
  const chaosMode = cli.chaosMode ?? process.env.FASE1_CHAOS ?? null;
  const profile = PROFILES[profileKind];
  const maxWaitMs = (totalDurationSec(profile) + warmupSec + 60) * 1000;

  console.log('[fase1-auto] config:', {
    baseUrl, email, profile: profileKind, laptop: cli.laptop, headless, warmupSec,
    maxWaitSec: Math.round(maxWaitMs / 1000),
    networkProfile: networkProfile ?? 'none',
    chaos: chaosMode ?? 'none',
  });

  // Import dinámico — playwright es optional dev-dep.
  const playwright = await import('playwright').catch((err) => {
    console.error(
      `[fase1-auto] Playwright no instalado. Ejecuta: npm install --save-dev @playwright/test && npx playwright install chromium\n${err}`,
    );
    process.exit(2);
  });

  const browser = await playwright.chromium.launch({
    headless,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Network throttling opcional via CDP.
  // Ref: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions
  let cdpSession: CDPSession | null = null;
  if (networkProfile) {
    cdpSession = await ctx.newCDPSession(page);
    const conditions = getNetworkConditions(networkProfile);
    if (conditions) {
      await cdpSession.send('Network.emulateNetworkConditions', conditions);
      console.log(`[fase1-auto] network throttling aplicado: ${networkProfile}`);
    }
  }

  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[stress-fase1]') || t.includes('AUTO-RUN')) {
      console.log(`  [browser] ${t}`);
    }
  });
  page.on('pageerror', (e) => console.error('  [browser-err]', e.message));

  console.log('[fase1-auto] navegando a', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const emailInput = page.locator('input[type="email"]').first();
  const hasLogin = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasLogin) {
    console.log('[fase1-auto] login form detectado — ingresando credenciales');
    await emailInput.fill(email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
  } else {
    console.log('[fase1-auto] sin login form (sesión ya activa)');
  }

  console.log('[fase1-auto] esperando workspace card');
  const wsCard = page.getByText('Entrar al espacio').first();
  await wsCard.waitFor({ timeout: 30_000 });
  await wsCard.click();

  console.log('[fase1-auto] esperando canvas 3D');
  await page.waitForSelector('[data-tour-step="space-canvas"] canvas', { timeout: 45_000 });

  console.log('[fase1-auto] canvas listo — warmup inicial 8s');
  await page.waitForTimeout(8000);

  const handleReady = await page.evaluate(() => {
    return typeof (window as unknown as { __stressRunProfile?: unknown }).__stressRunProfile === 'function';
  });
  if (!handleReady) {
    console.error('[fase1-auto] __stressRunProfile no disponible — StressFase1Panel no montó');
    await browser.close();
    process.exit(2);
  }

  console.log(`[fase1-auto] disparando __stressRunProfile("${profileKind}", { laptop: ${cli.laptop}, warmup: ${warmupSec} })`);
  await page.evaluate(([p, laptop, warmup]) => {
    (window as unknown as { __stressRunProfile: (k: string, opts: { laptop: boolean; warmup: number }) => void })
      .__stressRunProfile(p, { laptop: laptop as boolean, warmup: warmup as number });
  }, [profileKind, cli.laptop, warmupSec] as const);

  // Chaos injection — corre en paralelo durante el sampling.
  // network_blackout: corta red 3s cada 60s para validar reconexiones LiveKit.
  // tab_freeze: pausa el rAF del browser 2s cada 90s (CPU saturado simulado).
  let chaosTimer: ReturnType<typeof setInterval> | null = null;
  if (chaosMode && cdpSession) {
    chaosTimer = startChaosInjection(chaosMode, page, cdpSession);
  }

  const pollMs = 3000;
  console.log(`[fase1-auto] poleando __stressDone cada ${pollMs / 1000}s (timeout ${Math.round(maxWaitMs / 1000)}s)`);
  const startedAt = Date.now();
  let done = false;
  while (Date.now() - startedAt < maxWaitMs) {
    done = await page.evaluate(() => (window as unknown as { __stressDone?: boolean }).__stressDone === true);
    if (done) break;
    await page.waitForTimeout(pollMs);
    const elapsedMin = Math.round((Date.now() - startedAt) / 6000) / 10;
    process.stdout.write(`  … ${elapsedMin}m elapsed\r`);
  }
  console.log('');

  if (chaosTimer) clearInterval(chaosTimer);

  if (!done) {
    console.error('[fase1-auto] timeout esperando __stressDone');
    await captureAndSave(page, `timeout-${profileKind}`);
    await browser.close();
    process.exit(1);
  }

  const payload = await page.evaluate(() => {
    return (window as unknown as { __stressResult?: unknown }).__stressResult ?? null;
  }) as { result: StressRunResult; verdict: LeakVerdict; profile: string; baselineName: string; capturedAt: string } | null;

  if (!payload) {
    console.error('[fase1-auto] __stressResult vacío — fallo silencioso en el browser');
    await browser.close();
    process.exit(2);
  }

  const gitCommit = safeGitCommit();

  // Baseline comparison automática.
  const storage = new FileBaselineStorage(BASELINES_DIR);
  const baseline: BaselineSnapshot | null = storage.load(payload.baselineName);
  const baselineVerdict: BaselineVerdict | undefined = baseline
    ? compareToBaseline(payload.verdict, baseline)
    : undefined;

  // Guardar JSON enriquecido.
  mkdirSync(RUNS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outJsonPath = join(RUNS_DIR, `${ts}-${payload.baselineName}.json`);
  writeFileSync(outJsonPath, JSON.stringify({
    profile: payload.profile,
    baselineName: payload.baselineName,
    capturedAt: payload.capturedAt,
    gitCommit,
    result: payload.result,
    verdict: payload.verdict,
    baselineComparison: baselineVerdict ?? null,
    baselineCapturedAt: baseline?.capturedAt ?? null,
    networkProfile,
  }, null, 2));

  // HTML report.
  const html = new HtmlReportGenerator().render({
    profile: payload.profile,
    capturedAt: payload.capturedAt,
    gitCommit,
    run: payload.result,
    verdict: payload.verdict,
    baselineComparison: baselineVerdict,
    baselineCapturedAt: baseline?.capturedAt,
  });
  const outHtmlPath = outJsonPath.replace(/\.json$/, '.html');
  writeFileSync(outHtmlPath, html);

  console.log('\n═══════ RESUMEN FASE 1 ═══════');
  console.log(`  Profile:       ${payload.profile}`);
  console.log(`  Verdict SLO:   ${payload.verdict.pass ? 'PASS ✓' : 'FAIL ✗'}`);
  if (payload.verdict.reasons.length) console.log(`  SLO reasons:   ${payload.verdict.reasons.join(' | ')}`);
  console.log(`  Metrics:       ${JSON.stringify(payload.verdict.metrics)}`);
  if (baselineVerdict) {
    console.log(`  Baseline comp: ${baselineVerdict.passed ? 'NO REGRESSION ✓' : `REGRESSION × (${baselineVerdict.regressions.length})`}`);
    for (const r of baselineVerdict.regressions) {
      console.log(`    ⚠ ${r.metric}: ${r.baseline} → ${r.current} (${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct}%)`);
    }
  } else {
    console.log(`  Baseline:      (no existe — corré npm run stress:fase1:baseline-update -- --profile=${payload.baselineName})`);
  }
  console.log(`  JSON: ${outJsonPath}`);
  console.log(`  HTML: ${outHtmlPath}`);

  await browser.close();

  // Exit code: SLO fail OR baseline regression.
  const passed = payload.verdict.pass && (baselineVerdict ? baselineVerdict.passed : true);
  process.exit(passed ? 0 : 1);
}

interface CdpNetworkConditions {
  offline: boolean;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;
}

/**
 * Perfiles de red oficiales de Chrome DevTools.
 * Ref: https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts
 */
function getNetworkConditions(name: string): CdpNetworkConditions | null {
  const lowered = name.toLowerCase();
  if (lowered === 'fast-3g') {
    return { offline: false, latency: 562, downloadThroughput: 180_000, uploadThroughput: 84_375 };
  }
  if (lowered === 'slow-3g') {
    return { offline: false, latency: 2000, downloadThroughput: 62_500, uploadThroughput: 31_250 };
  }
  if (lowered === 'offline') {
    return { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };
  }
  console.warn(`[fase1-auto] network profile desconocido: "${name}" — sin throttling`);
  return null;
}

/**
 * Chaos injection — inyecta fallas controladas durante el run para validar
 * que los fix E (ghost cleanup) y reconexión LiveKit sean robustos.
 *
 * Ref: Netflix Chaos Monkey https://netflix.github.io/chaosmonkey/
 * WebRTC reconnection: https://docs.livekit.io/client-sdk-js/interfaces/RoomOptions.html#reconnectpolicy
 */
function startChaosInjection(
  mode: string,
  page: Page,
  cdp: CDPSession,
): ReturnType<typeof setInterval> | null {
  const lowered = mode.toLowerCase();

  if (lowered === 'network_blackout') {
    console.log('[fase1-auto] chaos: network_blackout cada 60s (3s offline)');
    return setInterval(async () => {
      console.log('  [chaos] 🌩 network OFFLINE 3s');
      try {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
        });
        await new Promise((r) => setTimeout(r, 3000));
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
        });
        console.log('  [chaos] ✓ network restored');
      } catch (e) {
        console.warn('  [chaos] fallo aplicando blackout:', e);
      }
    }, 60_000);
  }

  if (lowered === 'tab_freeze') {
    console.log('[fase1-auto] chaos: tab_freeze cada 90s (2s rAF pause)');
    return setInterval(async () => {
      try {
        await page.evaluate(() => {
          const start = Date.now();
          // Block event loop 2s para simular CPU saturation.
          while (Date.now() - start < 2000) { /* empty */ }
        });
        console.log('  [chaos] 🧊 tab froze 2s (CPU saturation sim)');
      } catch (e) {
        console.warn('  [chaos] fallo aplicando freeze:', e);
      }
    }, 90_000);
  }

  console.warn(`[fase1-auto] chaos mode desconocido: "${mode}" — sin inyección`);
  return null;
}

async function captureAndSave(page: Page, tag: string) {
  try {
    mkdirSync(RUNS_DIR, { recursive: true });
    const base = join(RUNS_DIR, `${tag}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    const partial = await page.evaluate(() => (window as unknown as { __stressResult?: unknown }).__stressResult ?? null);
    writeFileSync(`${base}.json`, JSON.stringify(partial, null, 2));
    console.error(`[fase1-auto] partial state saved: ${base}.{png,json}`);
  } catch (e) {
    console.error('[fase1-auto] failed to capture partial state:', e);
  }
}

// Silencia el warning de readdirSync no usado.
void readdirSync;

main().catch((err) => {
  console.error('[fase1-auto] fatal:', err);
  process.exit(2);
});
