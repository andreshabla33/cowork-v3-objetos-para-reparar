import { vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://dummy.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'dummy-anon-key-for-tests');
