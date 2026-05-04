/**
 * @module tests/stress/fase1-local/scripts/generate-report
 *
 * Genera un HTML con gráficos desde el último run JSON de un profile.
 * Si hay baseline, incluye la comparación inline.
 *
 * Uso:
 *   npx tsx tests/stress/fase1-local/scripts/generate-report.ts [--profile=load]
 *
 * Output: tests/stress/fase1-local/runs/<ISO>-<profile>.html
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StressRunResult, LeakVerdict } from '../domain/LeakDetectionCriteria';
import type { BaselineSnapshot } from '../domain/BaselineComparison';
import { compareToBaseline } from '../domain/BaselineComparison';
import { FileBaselineStorage } from '../infrastructure/BaselineStorage';
import { HtmlReportGenerator } from '../infrastructure/HtmlReportGenerator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, '..', 'runs');
const BASELINES_DIR = join(__dirname, '..', 'baselines');

function parseArgs(): { profile: string } {
  const args = process.argv.slice(2);
  let profile = 'load';
  for (const arg of args) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'profile' && v) profile = v;
  }
  return { profile };
}

function findLatestRun(profile: string): string | null {
  try {
    const files = readdirSync(RUNS_DIR)
      .filter((f) => f.endsWith('.json') && f.includes(`-${profile}.`))
      .sort();
    return files.length ? join(RUNS_DIR, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

function main() {
  const { profile } = parseArgs();
  const latest = findLatestRun(profile);
  if (!latest) {
    console.error(`[generate-report] no hay runs para profile "${profile}" en ${RUNS_DIR}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(latest, 'utf8')) as {
    result?: StressRunResult;
    verdict?: LeakVerdict;
    capturedAt?: string;
    gitCommit?: string | null;
  };
  if (!payload.result || !payload.verdict) {
    console.error(`[generate-report] run JSON incompleto: ${latest}`);
    process.exit(1);
  }

  const storage = new FileBaselineStorage(BASELINES_DIR);
  const baseline: BaselineSnapshot | null = storage.load(profile);
  const comparison = baseline ? compareToBaseline(payload.verdict, baseline) : undefined;

  const gen = new HtmlReportGenerator();
  const html = gen.render({
    profile,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    gitCommit: payload.gitCommit ?? null,
    run: payload.result,
    verdict: payload.verdict,
    baselineComparison: comparison,
    baselineCapturedAt: baseline?.capturedAt,
  });

  const outPath = latest.replace(/\.json$/, '.html');
  writeFileSync(outPath, html);
  console.log(`[generate-report] ✓ HTML generado: ${outPath}`);
}

main();
