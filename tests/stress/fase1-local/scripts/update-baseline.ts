/**
 * @module tests/stress/fase1-local/scripts/update-baseline
 *
 * Promueve el último run PASS como baseline nueva. Guarda en
 * tests/stress/fase1-local/baselines/<profile>.json (que se commitea al repo).
 *
 * Uso:
 *   npx tsx tests/stress/fase1-local/scripts/update-baseline.ts --profile=load [--force]
 *
 * Seguridad: NO promueve si el run falló los SLOs, salvo --force.
 * Esto evita que un baseline degradado se commitee por error.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LeakVerdict } from '../domain/LeakDetectionCriteria';
import { FileBaselineStorage } from '../infrastructure/BaselineStorage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, '..', 'runs');
const BASELINES_DIR = join(__dirname, '..', 'baselines');

function parseArgs(): { profile: string; force: boolean } {
  const args = process.argv.slice(2);
  let profile = 'load';
  let force = false;
  for (const arg of args) {
    if (arg === '--force') force = true;
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'profile' && v) profile = v;
  }
  return { profile, force };
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
  const { profile, force } = parseArgs();
  const latest = findLatestRun(profile);
  if (!latest) {
    console.error(`[update-baseline] no hay runs para profile "${profile}" en ${RUNS_DIR}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(latest, 'utf8')) as { verdict?: LeakVerdict };
  if (!payload.verdict) {
    console.error(`[update-baseline] run JSON sin verdict: ${latest}`);
    process.exit(1);
  }
  if (!payload.verdict.pass && !force) {
    console.error(`[update-baseline] último run de "${profile}" FAILEÓ los SLOs — no se promueve.`);
    console.error(`  Reasons: ${payload.verdict.reasons.join(' | ')}`);
    console.error(`  Si querés forzarlo igual: agregá --force`);
    process.exit(1);
  }

  const storage = new FileBaselineStorage(BASELINES_DIR);
  const snapshot = storage.save(profile, payload.verdict);
  console.log(`[update-baseline] ✓ baseline "${profile}" actualizado desde ${latest}`);
  console.log(`  Guardado en: ${storage.path(profile)}`);
  console.log(`  Commit ref: ${snapshot.gitCommit?.slice(0, 8) ?? 'unknown'}`);
  console.log(`  Metrics:`, snapshot.verdict.metrics);
  console.log(`\nNo olvides commitear el JSON al repo:`);
  console.log(`  git add tests/stress/fase1-local/baselines/${profile}.json`);
  console.log(`  git commit -m "test(stress): baseline ${profile} @ ${snapshot.gitCommit?.slice(0, 8) ?? 'HEAD'}"`);
}

main();
