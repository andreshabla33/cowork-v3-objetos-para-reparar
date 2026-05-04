/**
 * @module tests/stress/scripts/run-all-phases
 *
 * Orquestador top-level. Ejecuta Fase 1 → (gate) → Fase 2 → (gate) → Fase 3
 * en un solo comando, abortando temprano si alguna fase falla. Cada fase corre
 * como child_process separado para que un crash no contamine a las demás.
 *
 * Gate strategy (oficialmente recomendado — Test Pyramid):
 *   - Fase 1 valida renderer local. Si falla, Fase 2/3 no tienen sentido.
 *   - Fase 2 valida SFU bajo carga real. Si falla, Fase 3 E2E mentiría.
 *   - Fase 3 valida integración end-to-end con todos los fixes aplicados.
 *
 * Cost-zero hasta Fase 3 (que consume minutos LiveKit Cloud).
 *
 * Uso básico (solo Fase 1 automática + Fase 2/3 skip si env vars faltan):
 *   FASE1_BASE_URL=http://localhost:5173 \
 *   FASE1_LOGIN_EMAIL=am@urpeailab.com \
 *   FASE1_LOGIN_PASSWORD=*** \
 *   npx tsx tests/stress/scripts/run-all-phases.ts
 *
 * Uso completo (3 fases):
 *   FASE1_BASE_URL=http://localhost:5173 \
 *   FASE1_LOGIN_EMAIL=... FASE1_LOGIN_PASSWORD=... \
 *   LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
 *   E2E_BASE_URL=http://localhost:5173 \
 *   RUN_ALL_PHASES=1 \
 *   npx tsx tests/stress/scripts/run-all-phases.ts
 *
 * Flags:
 *   RUN_PHASES=1,2,3      — fases a ejecutar (default: 1)
 *   SKIP_GATE=true        — corre todas las fases aunque una falle (para debug)
 */

import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');

// Auto-carga de .env.stress.local desde la raíz del repo.
// Formato compatible con dotenv: KEY=VALUE por línea, # para comentarios, quotes opcionales.
// Evita dependencia del paquete 'dotenv' — parser mínimo suficiente para stress test.
loadEnvFileIfPresent(join(ROOT, '.env.stress.local'));

function loadEnvFileIfPresent(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  let loaded = 0;
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded++;
    }
  }
  console.log(`[run-all-phases] cargado ${loaded} var(s) desde ${path}`);
}

const RUN_PHASES = (process.env.RUN_PHASES ?? '1').split(',').map((s) => s.trim());
const SKIP_GATE = (process.env.SKIP_GATE ?? 'false').toLowerCase() === 'true';

interface PhaseResult {
  readonly phase: 1 | 2 | 3;
  readonly exitCode: number;
  readonly durationSec: number;
  readonly skipped: boolean;
  readonly skipReason?: string;
}

function runPhase(phase: 1 | 2 | 3): Promise<PhaseResult> {
  return new Promise((resolveP) => {
    const scriptPath: Record<1 | 2 | 3, string> = {
      1: 'tests/stress/fase1-local/scripts/run-fase1-auto.ts',
      2: 'tests/stress/fase2-sfu/scripts/run-sfu-stress.ts',
      3: 'tests/stress/fase3-playwright/scripts/run-e2e-stress.ts',
    };

    // Pre-chequeo de env vars por fase — skip con warning si faltan.
    const precheck: Record<1 | 2 | 3, () => string | null> = {
      1: () => {
        const missing = ['FASE1_BASE_URL', 'FASE1_LOGIN_EMAIL', 'FASE1_LOGIN_PASSWORD']
          .filter((k) => !process.env[k]);
        return missing.length ? `missing env: ${missing.join(', ')}` : null;
      },
      2: () => {
        const missing = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
          .filter((k) => !process.env[k]);
        return missing.length ? `missing env: ${missing.join(', ')}` : null;
      },
      3: () => (process.env.E2E_BASE_URL ? null : 'missing env: E2E_BASE_URL'),
    };

    const skipReason = precheck[phase]();
    if (skipReason) {
      console.log(`\n━━━ FASE ${phase} — SKIP (${skipReason}) ━━━`);
      resolveP({ phase, exitCode: 0, durationSec: 0, skipped: true, skipReason });
      return;
    }

    console.log(`\n━━━ FASE ${phase} — INICIANDO ━━━`);
    const started = Date.now();
    const child = spawn('npx', ['tsx', scriptPath[phase]], {
      stdio: 'inherit',
      cwd: ROOT,
      env: process.env,
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      const durationSec = Math.round((Date.now() - started) / 1000);
      console.log(`━━━ FASE ${phase} — exit ${code} (${durationSec}s) ━━━`);
      resolveP({ phase, exitCode: code ?? 1, durationSec, skipped: false });
    });
  });
}

async function main() {
  console.log('[run-all-phases] plan:', { RUN_PHASES, SKIP_GATE });
  const results: PhaseResult[] = [];

  for (const p of RUN_PHASES) {
    const phase = parseInt(p, 10) as 1 | 2 | 3;
    if (phase !== 1 && phase !== 2 && phase !== 3) {
      console.warn(`[run-all-phases] fase inválida ignorada: ${p}`);
      continue;
    }
    const res = await runPhase(phase);
    results.push(res);
    if (!res.skipped && res.exitCode !== 0 && !SKIP_GATE) {
      console.error(`\n[run-all-phases] fase ${phase} falló (exit ${res.exitCode}) — abortando (SKIP_GATE=false)`);
      break;
    }
  }

  console.log('\n═══════════════ RESUMEN ═══════════════');
  for (const r of results) {
    const tag = r.skipped ? 'SKIP' : r.exitCode === 0 ? 'PASS ✓' : 'FAIL ✗';
    const note = r.skipReason ? ` (${r.skipReason})` : r.skipped ? '' : ` — ${r.durationSec}s`;
    console.log(`  Fase ${r.phase}: ${tag}${note}`);
  }

  const anyFailed = results.some((r) => !r.skipped && r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('[run-all-phases] fatal:', err);
  process.exit(2);
});
