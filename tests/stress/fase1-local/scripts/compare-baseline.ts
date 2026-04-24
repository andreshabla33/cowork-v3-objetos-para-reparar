/**
 * @module tests/stress/fase1-local/scripts/compare-baseline
 *
 * Compara el último run JSON contra la baseline committed del profile.
 * Exit code 0 = no regresión, 1 = regresión detectada, 2 = baseline missing.
 *
 * Uso:
 *   npx tsx tests/stress/fase1-local/scripts/compare-baseline.ts [--profile=load] [--threshold=15]
 *
 * Estrategia:
 *   - Lee runs/*.json más reciente que matchee `*-<profile>.json`.
 *   - Lee baselines/<profile>.json (si no existe → exit 2 + mensaje "corré update-baseline").
 *   - Aplica compareToBaseline() pure function.
 *   - Imprime tabla delta + JSON machine-readable a stdout.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareToBaseline, DEFAULT_THRESHOLDS } from '../domain/BaselineComparison';
import type { BaselineSnapshot, RegressionThresholds } from '../domain/BaselineComparison';
import type { LeakVerdict } from '../domain/LeakDetectionCriteria';
import { FileBaselineStorage } from '../infrastructure/BaselineStorage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, '..', 'runs');
const BASELINES_DIR = join(__dirname, '..', 'baselines');

function parseArgs(): { profile: string; thresholdPct: number } {
  const args = process.argv.slice(2);
  let profile = 'load';
  let thresholdPct = DEFAULT_THRESHOLDS.maxWorsePct;
  for (const arg of args) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'profile' && v) profile = v;
    if (k === 'threshold' && v) thresholdPct = parseFloat(v);
  }
  return { profile, thresholdPct };
}

function findLatestRun(profile: string): string | null {
  if (!existsSyncSafe(RUNS_DIR)) return null;
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json') && f.includes(`-${profile}.`))
    .sort();
  return files.length ? join(RUNS_DIR, files[files.length - 1]) : null;
}

function existsSyncSafe(p: string): boolean {
  try {
    readdirSync(p);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const { profile, thresholdPct } = parseArgs();
  const thresholds: RegressionThresholds = {
    ...DEFAULT_THRESHOLDS,
    maxWorsePct: thresholdPct,
  };

  const storage = new FileBaselineStorage(BASELINES_DIR);
  const baseline: BaselineSnapshot | null = storage.load(profile);
  if (!baseline) {
    console.error(`[compare-baseline] no hay baseline para profile "${profile}" en ${storage.path(profile)}.`);
    console.error(`  Ejecutá primero: npm run stress:fase1:baseline-update -- --profile=${profile}`);
    process.exit(2);
  }

  const latest = findLatestRun(profile);
  if (!latest) {
    console.error(`[compare-baseline] no hay runs recientes para profile "${profile}" en ${RUNS_DIR}`);
    process.exit(2);
  }

  const runPayload = JSON.parse(readFileSync(latest, 'utf8')) as { verdict?: LeakVerdict };
  if (!runPayload.verdict) {
    console.error(`[compare-baseline] run JSON sin verdict: ${latest}`);
    process.exit(2);
  }

  const comparison = compareToBaseline(runPayload.verdict, baseline, thresholds);

  console.log('\n═══════════ BASELINE COMPARISON ═══════════');
  console.log(`  Profile:    ${profile}`);
  console.log(`  Baseline:   ${baseline.capturedAt} (commit ${baseline.gitCommit?.slice(0, 8) ?? 'unknown'})`);
  console.log(`  Latest run: ${latest}`);
  console.log(`  Threshold:  ${thresholds.maxWorsePct}%`);
  console.log('\n  Métrica         Baseline   Current    Δ abs    Δ %       Estado');
  console.log('  ─────────────── ────────── ────────── ──────── ───────── ──────');
  for (const c of comparison.comparisons) {
    const status = c.regressed ? 'REGRES' : 'OK';
    console.log(
      `  ${c.metric.padEnd(15)} ${fmt(c.baseline).padStart(10)} ${fmt(c.current).padStart(10)} ` +
      `${fmt(c.deltaAbsolute).padStart(8)} ${(c.deltaPct >= 0 ? '+' : '') + c.deltaPct.toFixed(1)}%`.padEnd(10) +
      `   ${status}`,
    );
  }
  console.log('\n  VERDICT:', comparison.passed ? 'NO REGRESSION ✓' : `REGRESSION × (${comparison.regressions.length} métricas)`);

  // Machine-readable JSON output (stderr separado para scripts externos).
  console.error(JSON.stringify({ comparison, profile, baselineSource: storage.path(profile), latestRun: latest }));

  process.exit(comparison.passed ? 0 : 1);
}

function fmt(n: number): string {
  return n.toFixed(1);
}

main();
