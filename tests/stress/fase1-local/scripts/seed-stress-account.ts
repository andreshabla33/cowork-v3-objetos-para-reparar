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

  const email = 'stress_bot@urpeailab.com';
  const password = 'StressBot2026.x9Kmp7!';

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`[seed] llamando auth.signUp({ email: ${email} })`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: 'Stress Bot' } },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      console.log('[seed] usuario ya existe — intentando signIn para verificar password');
      const si = await supabase.auth.signInWithPassword({ email, password });
      if (si.error) {
        console.error(`[seed] signIn también falló: ${si.error.message}`);
        console.error(`[seed] → reset via dashboard o re-create con otro email`);
        process.exit(2);
      }
      console.log('[seed] signIn OK — cuenta usable. user_id:', si.data.user?.id);
      process.exit(0);
    }
    console.error(`[seed] signUp error: ${error.message}`);
    process.exit(2);
  }

  const userId = data.user?.id;
  if (!userId) {
    console.error('[seed] signUp sin userId — posible que email confirmation esté activo');
    console.error('[seed] verificá dashboard → Authentication → Providers → Email');
    process.exit(2);
  }

  console.log(`[seed] ✓ usuario creado. user_id: ${userId}`);
  console.log(`[seed] email: ${email}`);
  console.log(`[seed] password: ${password}`);
  console.log('');
  console.log('[seed] PRÓXIMO PASO: asociar al workspace. Ejecuta este SQL:');
  console.log(`
INSERT INTO miembros_espacio (
  espacio_id, usuario_id, rol, aceptado, aceptado_en,
  empresa_id, onboarding_completado, tour_completado
) VALUES (
  '91887e81-1f26-448c-9d6d-9839e7d83b5d',
  '${userId}',
  'miembro', true, now(),
  '253cb3b6-64d5-480d-b9a5-a7db34eee876',
  true, true
);`);
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(3);
});
