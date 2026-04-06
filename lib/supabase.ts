import { createClient } from '@supabase/supabase-js';
import { CONFIG_PUBLICA_APP } from './env';
import { runStartupSecurityChecks } from './security/validateEnvKeys';

export const APP_URL = CONFIG_PUBLICA_APP.urlApp;
export const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
export const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;

// VULN-001: Validate that anon key is not actually the service_role key
runStartupSecurityChecks(SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
