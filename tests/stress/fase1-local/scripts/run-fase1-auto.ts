/**
 * @module tests/stress/fase1-local/scripts/run-fase1-auto
 *
 * Runner automatizado de Fase 1. Lanza Chromium via Playwright, ejecuta login,
 * entra al primer workspace, y dispara `window.__stressStartAuto()` dentro del
 * espacio 3D. Polea `window.__stressDone` hasta completar, extrae el resultado
 * y lo guarda como JSON. Exit code 0 si verdict.pass, 1 si FAIL.
 *
 * Uso:
 *   FASE1_BASE_URL=http://localhost:5173 \
 *   FASE1_LOGIN_EMAIL=am@urpeailab.com \
 *   FASE1_LOGIN_PASSWORD=*** \
 *   FASE1_DURATION_SEC=300 \
 *   FASE1_HEADLESS=false \
 *   npx tsx tests/stress/fase1-local/scripts/run-fase1-auto.ts
 *
 * Precondición:
 *   - npm install --save-dev @playwright/test && npx playwright install chromium
 *   - Dev server corriendo en FASE1_BASE_URL (npm run dev)
 *   - Cuenta de login con al menos un workspace en el que sea "miembro"
 *
 * Clean Architecture: Infrastructure + Entry point. Reutiliza BrowserLauncher
 * de Fase 3 para evitar duplicación de flags Chromium oficiales.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function main() {
  const baseUrl = envOr('FASE1_BASE_URL');
  const email = envOr('FASE1_LOGIN_EMAIL');
  const password = envOr('FASE1_LOGIN_PASSWORD');
  const durationSec = envInt('FASE1_DURATION_SEC', 300);
  const warmupSec = envInt('FASE1_WARMUP_SEC', 5);
  const headless = (process.env.FASE1_HEADLESS ?? 'false').toLowerCase() !== 'false';

  console.log('[fase1-auto] config:', { baseUrl, email, durationSec, warmupSec, headless });

  // Import dinámico — playwright es optional dev-dep.
  const playwright = await import('playwright').catch((err) => {
    console.error(
      `[fase1-auto] Playwright no instalado. Ejecuta: npm install --save-dev @playwright/test && npx playwright install chromium\n${err}`,
    );
    process.exit(2);
  });

  const browser = await playwright.chromium.launch({
    headless,
    // Flags mínimos — Fase 1 no necesita fake media (no toggleamos cam/mic).
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Capture console logs para debug.
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[stress-fase1]') || t.includes('AUTO-RUN')) {
      console.log(`  [browser] ${t}`);
    }
  });
  page.on('pageerror', (e) => console.error('  [browser-err]', e.message));

  console.log('[fase1-auto] navegando a', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  // Login si hay form (skip si ya logueado).
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

  // Entrar al primer workspace.
  console.log('[fase1-auto] esperando workspace card');
  const wsCard = page.getByText('Entrar al espacio').first();
  await wsCard.waitFor({ timeout: 30_000 });
  await wsCard.click();

  // Esperar a que el Canvas 3D monte (VirtualSpace3D render).
  console.log('[fase1-auto] esperando canvas 3D');
  await page.waitForSelector('[data-tour-step="space-canvas"] canvas', { timeout: 45_000 });

  // Warmup adicional para estabilizar LiveKit room + primeros renders.
  console.log('[fase1-auto] canvas listo — warmup inicial 8s');
  await page.waitForTimeout(8000);

  // Verificar que __stressStartAuto exista en window.
  const handleReady = await page.evaluate(() => {
    return typeof (window as unknown as { __stressStartAuto?: unknown }).__stressStartAuto === 'function';
  });
  if (!handleReady) {
    console.error('[fase1-auto] __stressStartAuto no disponible — StressFase1Panel no montó');
    await browser.close();
    process.exit(2);
  }

  // Disparar auto-run.
  console.log(`[fase1-auto] disparando __stressStartAuto({ duration: ${durationSec}, warmup: ${warmupSec} })`);
  await page.evaluate(([d, w]) => {
    (window as unknown as { __stressStartAuto: (opts: { duration: number; warmup: number }) => void })
      .__stressStartAuto({ duration: d, warmup: w });
  }, [durationSec, warmupSec] as const);

  // Poll hasta __stressDone=true o timeout (duration + warmup + margen 60s).
  const maxWaitMs = (durationSec + warmupSec + 60) * 1000;
  const pollMs = 5000;
  console.log(`[fase1-auto] poleando __stressDone cada ${pollMs / 1000}s (timeout ${maxWaitMs / 1000}s)`);
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

  if (!done) {
    console.error('[fase1-auto] timeout esperando __stressDone');
    await captureAndSave(page, 'timeout');
    await browser.close();
    process.exit(1);
  }

  // Extraer resultado.
  const payload = await page.evaluate(() => {
    return (window as unknown as { __stressResult?: unknown }).__stressResult ?? null;
  });

  const outDir = join(__dirname, '..', 'runs');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const verdict = (payload as { verdict?: { pass: boolean; reasons: string[]; metrics: unknown } } | null)?.verdict;
  console.log('\n[fase1-auto] RESUMEN:');
  console.log(`  Verdict: ${verdict?.pass ? 'PASS ✓' : 'FAIL ✗'}`);
  if (verdict?.reasons?.length) console.log(`  Reasons: ${verdict.reasons.join(' | ')}`);
  console.log(`  Metrics: ${JSON.stringify(verdict?.metrics ?? {})}`);
  console.log(`  JSON: ${outPath}`);

  await browser.close();
  process.exit(verdict?.pass ? 0 : 1);
}

async function captureAndSave(page: Page, tag: string) {
  try {
    const outDir = join(__dirname, '..', 'runs');
    mkdirSync(outDir, { recursive: true });
    const base = join(outDir, `${tag}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    const partial = await page.evaluate(() => (window as unknown as { __stressResult?: unknown }).__stressResult ?? null);
    writeFileSync(`${base}.json`, JSON.stringify(partial, null, 2));
    console.error(`[fase1-auto] partial state saved: ${base}.{png,json}`);
  } catch (e) {
    console.error('[fase1-auto] failed to capture partial state:', e);
  }
}

main().catch((err) => {
  console.error('[fase1-auto] fatal:', err);
  process.exit(2);
});
