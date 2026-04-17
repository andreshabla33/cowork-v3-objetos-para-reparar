import { createClient } from '@supabase/supabase-js';
import { CONFIG_PUBLICA_APP } from './env';
import { runStartupSecurityChecks } from './security/validateEnvKeys';
import { logger } from './logger';

export const APP_URL = CONFIG_PUBLICA_APP.urlApp;
export const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
export const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;

// VULN-001: Validate that anon key is not actually the service_role key
runStartupSecurityChecks(SUPABASE_ANON_KEY);

const logRealtime = logger.child('realtime-health');

// ── Realtime transport config ────────────────────────────────────────────────
//
// worker: true
//   Mueve el heartbeat a un Web Worker off-main-thread. Elimina el
//   acoplamiento entre el scheduler de setTimeout del main thread y los
//   "phx_heartbeat" de Phoenix. Sin worker, picos de batching/GPU o Garbage
//   Collection pueden retrasar el timer del heartbeat más allá del intervalo
//   → Phoenix dispara heartbeat_timeout → todos los canales se marcan
//   TIMED_OUT simultáneamente (visto en logs 2026-04-17: 3 timeouts en 33s
//   durante Scene ready + MultiBatch register burst).
//   Ref: https://supabase.com/docs/guides/troubleshooting/realtime-connections-timed_out-status
//   Ref: https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
//
// heartbeatIntervalMs: 25_000
//   Revertido al default oficial (25s, tolerancia 30s). Antes estaba en
//   15s intentando detectar desconexiones más rápido, pero con worker=true
//   el heartbeat ya no está sujeto a jitter del main thread, así que el
//   valor bajo solo aumentaba el tráfico (msg quota) sin aportar robustez.
//   Ref: realtime-js CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL = 25000ms.
//
// heartbeatCallback
//   Observabilidad: loggea transiciones del heartbeat interno para
//   correlacionar con Sentry sin entrar en la lógica de recovery (el
//   rejoinTimer interno de RealtimeChannel ya reconecta automáticamente).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    heartbeatIntervalMs: 25_000,
    worker: true,
    heartbeatCallback: (status) => {
      if (status === 'disconnected' || status === 'timeout') {
        logRealtime.warn('Heartbeat status', { status });
      }
    },
  },
});
