/**
 * @module tests/stress/fase2-sfu/scripts/run-sfu-stress
 *
 * Entry point ejecutable de Fase 2.
 *
 * Uso:
 *   LIVEKIT_URL=wss://cowork-1zce4tcm.livekit.cloud \
 *   LIVEKIT_API_KEY=xxx \
 *   LIVEKIT_API_SECRET=xxx \
 *   npx tsx tests/stress/fase2-sfu/scripts/run-sfu-stress.ts
 *
 * Output:
 *   tests/stress/fase2-sfu/runs/<timestamp>.json
 *
 * Precondición: livekit-cli instalado en PATH (`brew install livekit-cli`
 * o curl https://get.livekit.io/cli | bash).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LoadTestRunner } from '../application/LoadTestRunner';
import { LkCliAdapter } from '../infrastructure/LkCliAdapter';
import type { RampUpPlan } from '../domain/LoadTestScenario';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..');

// Auto-carga `.env.stress.local` (cross-shell consistency con Fase 1).
loadEnvFileIfPresent(join(ROOT, '.env.stress.local'));

function loadEnvFileIfPresent(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(trimmed);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  console.log(`[sfu-stress] env cargadas desde ${path}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[sfu-stress] missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const adapter = new LkCliAdapter({
    url: requireEnv('LIVEKIT_URL'),
    apiKey: requireEnv('LIVEKIT_API_KEY'),
    apiSecret: requireEnv('LIVEKIT_API_SECRET'),
    binary: process.env.LK_CLI_BINARY ?? 'lk',
  });

  // Tiers reducidos para validación inicial — full plan (10/25/50/75/100 × 120s)
  // queda para CI nightly o env var override.
  // Default usa ~30 participant-min (vs ~250 del full plan).
  const tiersFromEnv = (process.env.SFU_TIERS ?? '5,10,25').split(',').map((s) => parseInt(s.trim(), 10));
  const durFromEnv = parseInt(process.env.SFU_TIER_DURATION_SEC ?? '60', 10);
  const plan: RampUpPlan = {
    baseRoomName: `stress-sfu-${new Date().toISOString().slice(0, 10)}`,
    tiers: tiersFromEnv,
    durationPerTierSeconds: durFromEnv,
    videoResolution: '360p',
    videoCodec: 'vp8',
    audioBitrateBps: 20000,
    publisherRatio: 0.25, // 25% publica, 75% solo subscribe (realista para espacios grupales)
  };

  console.log('[sfu-stress] plan:', plan);
  const runner = new LoadTestRunner(adapter);
  const report = await runner.runRampUp(plan);

  // Persistir report en runs/
  const runsDir = join(__dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const outPath = join(runsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n[sfu-stress] RESUMEN:');
  console.log(`  Plan room: ${report.planRoom}`);
  console.log(`  Overall: ${report.overallPass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  Tiers ejecutados: ${report.verdicts.length}`);
  for (const v of report.verdicts) {
    console.log(`    ${v.scenarioName}: ${v.pass ? 'PASS' : 'FAIL'} ${v.reasons.length > 0 ? '— ' + v.reasons.join(' | ') : ''}`);
  }
  console.log(`\n  Report JSON: ${outPath}`);

  process.exit(report.overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[sfu-stress] fatal:', err);
  process.exit(2);
});
