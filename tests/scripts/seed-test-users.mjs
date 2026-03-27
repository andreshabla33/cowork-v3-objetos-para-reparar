/**
 * Script para crear usuarios de prueba en Supabase
 * ==================================================
 * Ejecutar una sola vez antes de correr los tests:
 *   node tests/scripts/seed-test-users.mjs
 *
 * Requiere variables de entorno:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service role, NO anon key)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables de entorno:');
  console.error('   VITE_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Ejemplo:');
  console.error('  $env:VITE_SUPABASE_URL="https://xxx.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."');
  console.error('  node tests/scripts/seed-test-users.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USERS = [
  {
    email: 'qa-test@cowork.app',
    password: 'TestQA2026!',
    name: 'QA Tester',
  },
  {
    email: 'qa-admin@cowork.app',
    password: 'AdminQA2026!',
    name: 'QA Admin',
  },
];

async function seedUsers() {
  console.log('🌱 Creando usuarios de prueba...\n');

  for (const user of TEST_USERS) {
    try {
      // Verificar si ya existe
      const { data: existing } = await supabase.auth.admin.listUsers();
      const alreadyExists = existing?.users?.find((u) => u.email === user.email);

      if (alreadyExists) {
        console.log(`  ✅ ${user.email} ya existe (id: ${alreadyExists.id})`);
        continue;
      }

      // Crear usuario
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true, // Auto-confirmar email
        user_metadata: { full_name: user.name },
      });

      if (error) {
        console.error(`  ❌ Error creando ${user.email}:`, error.message);
        continue;
      }

      console.log(`  ✅ ${user.email} creado (id: ${data.user.id})`);
    } catch (err) {
      console.error(`  ❌ Error inesperado con ${user.email}:`, err.message);
    }
  }

  console.log('\n✨ Seed completado.');
  console.log('\nAhora puedes ejecutar los tests:');
  console.log('  npm run test:smoke');
}

seedUsers();
