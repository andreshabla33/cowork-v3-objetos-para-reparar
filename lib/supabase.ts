import { createClient } from '@supabase/supabase-js';
import { CONFIG_PUBLICA_APP } from './env';
import { runStartupSecurityChecks } from './security/validateEnvKeys';

export const APP_URL = CONFIG_PUBLICA_APP.urlApp;
export const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
export const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;

// VULN-001: Validate that anon key is not actually the service_role key
runStartupSecurityChecks(SUPABASE_ANON_KEY);

// Realtime heartbeat tuned from the 25s default → 15s.
// Shorter window means a dropped socket is detected sooner, so fewer
// channels accumulate in "errored" before RealtimeClient reconnects.
// Ref: https://supabase.com/docs/guides/realtime/limits (100 ch/conn)
// Ref: realtime-js CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL = 25000ms default.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    heartbeatIntervalMs: 15_000,
  },
});
