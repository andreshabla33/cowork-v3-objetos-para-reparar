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

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LoadTestRunner } from '../application/LoadTestRunner';
import { LkCliAdapter } from '../infrastructure/LkCliAdapter';
import type { RampUpPlan } from '../domain/LoadTestScenario';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  const plan: RampUpPlan = {
    baseRoomName: `stress-sfu-${new Date().toISOString().slice(0, 10)}`,
    tiers: [10, 25, 50, 75, 100],
    durationPerTierSeconds: 120,
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
