/**
 * @module tests/stress/fase1-local/scripts/seed-stress-account
 *
 * Crea (o recrea) la cuenta `stress_bot@urpeailab.com` usando la API oficial
 * `supabase.auth.signUp()` — no raw SQL a auth.users, respeta la GoTrue flow
 * completa (hashing, identity creation, tokens).
 *
 * Precondición:
 *   - `.env` tiene VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *   - Proyecto Supabase tiene "Email confirmations" DESHABILITADO (dashboard
 *     → Authentication → Providers → Email → Confirm email = off).
 *     Si está habilitado, el usuario queda pending_confirm y no puede login.
 *
 * Uso:
 *   npx tsx tests/stress/fase1-local/scripts/seed-stress-account.ts
 *
 * Post-condition:
 *   - auth.users tiene al bot
 *   - public.usuarios tiene perfil (via trigger handle_new_user)
 *   - miembros_espacio debe hacerse aparte via SQL (requiere service_role o MCP)
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..');

loadEnvFileIfPresent(`${ROOT}/.env`);

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
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[seed] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  // CLI: --email=<single> | --count=N (genera stress_bot_01..stress_bot_NN)
  const args = process.argv.slice(2);
  let count = 1;
  let singleEmail: string | null = null;
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'count' && v) count = parseInt(v, 10);
    if (k === 'email' && v) singleEmail = v;
  }

  const password = 'StressBot2026.x9Kmp7!';
  const targets = singleEmail
    ? [singleEmail]
    : count === 1
      ? ['stress_bot@urpeailab.com']
      : Array.from({ length: count }, (_, i) => `stress_bot_${String(i + 1).padStart(2, '0')}@urpeailab.com`);

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const email of targets) {
    console.log(`[seed] auth.signUp({ email: ${email} })`);
    await seedOne(supabase, email, password);
  }
  return;
}

async function seedOne(supabase: import('@supabase/supabase-js').SupabaseClient, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: email.split('@')[0] } },
  });

  if (error) {
    if (error.message.includes('already registered') || error.message.toLowerCase().includes('already')) {
      console.log(`[seed]   ↻ ${email} ya existe — skip`);
      return;
    }
    console.error(`[seed]   ✗ signUp ${email}: ${error.message}`);
    return;
  }
  const userId = data.user?.id;
  if (!userId) {
    console.error(`[seed]   ✗ ${email} sin userId (email confirmation activado?)`);
    return;
  }
  console.log(`[seed]   ✓ ${email} → user_id ${userId}`);
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(3);
});
