/**
 * Configuración centralizada para tests QA
 * Credenciales y URLs se leen de variables de entorno o .env.test
 */
export const TEST_CONFIG = {
  /** Credenciales de usuario de prueba (debe existir en Supabase) */
  testUser: {
    email: process.env.TEST_USER_EMAIL || 'qa-test@cowork.app',
    password: process.env.TEST_USER_PASSWORD || 'TestQA2026!',
    name: 'QA Tester',
  },

  /** Credenciales de admin de prueba */
  adminUser: {
    email: process.env.TEST_ADMIN_EMAIL || 'qa-admin@cowork.app',
    password: process.env.TEST_ADMIN_PASSWORD || 'AdminQA2026!',
    name: 'QA Admin',
  },

  /** URLs */
  baseURL: process.env.BASE_URL || 'http://localhost:3000',

  /** Supabase */
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',

  /** Timeouts personalizados */
  timeouts: {
    navigation: 30_000,
    animation: 2_000,
    supabaseQuery: 10_000,
    threeJsLoad: 20_000,
  },

  /** IDs conocidos para tests */
  espacioGlobalId: '91887e81-1f26-448c-9d6d-9839e7d83b5d',
} as const;
