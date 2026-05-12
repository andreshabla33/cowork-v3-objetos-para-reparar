import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_PUBLICA_APP } from '@/core/infrastructure/env/env';
import { runStartupSecurityChecks } from '@/core/infrastructure/security/validateEnvKeys';
import { logger } from '@/core/infrastructure/observability/logger';

export const APP_URL = CONFIG_PUBLICA_APP.urlApp;
export const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
export const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;

// VULN-001: Validate that anon key is not actually the service_role key
runStartupSecurityChecks(SUPABASE_ANON_KEY);

const logRealtime = logger.child('realtime-health');

// ── Forced socket recovery (issue supabase/realtime#1088) ────────────────────
//
// Problema: tras `disconnected` heartbeats sostenidos (típicamente por tab
// backgrounded mucho tiempo), el rejoinTimer interno de realtime-js no logra
// reconectar — los channels quedan en `errored` state forever, emitiendo
// TIMED_OUT en cada intento. El health-check de presence sólo purga
// channels en `closed`, no `errored`, así que la recuperación nunca dispara.
//
// Fix oficial recomendado en issue #1088: `manual disconnection works
// properly`. Forzamos `realtime.disconnect()` + `realtime.connect()` cuando
// vemos N consecutive `disconnected` heartbeats. Los channels suscritos
// auto-rejoin sobre el nuevo socket.
//
// Debouncing: mínimo 10s entre intentos para no entrar en loop si la
// network está caída del lado del usuario.
//
// Refs:
// - https://github.com/supabase/realtime/issues/1088
// - https://supabase.com/docs/guides/troubleshooting/realtime-connections-timed_out-status
// - https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
const RECOVERY_DISCONNECTED_THRESHOLD = 2; // disconnected events before force-recover
const RECOVERY_MIN_INTERVAL_MS = 10_000;
let consecutiveDisconnected = 0;
let lastRecoveryAt = 0;
let supabaseRef: SupabaseClient | null = null;

function tryForceRealtimeRecovery(): void {
  const now = Date.now();
  if (now - lastRecoveryAt < RECOVERY_MIN_INTERVAL_MS) return;
  if (!supabaseRef) return;
  lastRecoveryAt = now;
  consecutiveDisconnected = 0;
  logRealtime.warn('Forcing realtime socket recovery (disconnect + connect)');
  try {
    supabaseRef.realtime.disconnect();
    // Brief delay para asegurar disconnect limpio antes de reabrir.
    setTimeout(() => {
      try {
        supabaseRef?.realtime.connect();
        logRealtime.info('Realtime socket reconnected after forced recovery');
      } catch (e) {
        logRealtime.warn('Realtime reconnect failed', { error: e instanceof Error ? e.message : String(e) });
      }
    }, 200);
  } catch (e) {
    logRealtime.warn('Realtime disconnect failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

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
// ── Auth lock noop (issue supabase/supabase#42505) ───────────────────────────
//
// Bug 2026-05-12: primer arranque post-deploy se quedaba colgado en
// "SINCRONIZANDO WORKSPACE" — `supabase.auth.getSession()` esperaba 5s para
// el lock steal automático, y a veces el flow se quedaba >60s sin completar.
//
// Causa root: `@supabase/auth-js` usa `navigator.locks.request()` para
// coordinar el refresh del token entre múltiples tabs/contextos. Cuando el
// lock queda "orphaned" (component unmount mid-operation, SW de deploy
// previo aún activo, etc.), el auto-recovery con `{ steal: true }` puede
// dejar la promise interna en estado inconsistente.
//
// Workaround oficial documentado (supabase/supabase#42505): pasar un `lock`
// noop que ejecuta fn() directamente sin coordinación.
//
// Trade-off aceptable: si dos tabs refrescan el token en el mismo segundo,
// ambos hacen HTTP request a `/auth/v1/token?grant_type=refresh_token`.
// Supabase server es idempotente con `refresh_token` — retorna el mismo
// nuevo token a ambos. NO hay corrupción de sesión.
//
// API @experimental: https://github.com/supabase/supabase-js — `auth.lock`
// Ref: https://github.com/supabase/supabase/issues/42505
const noopAuthLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: noopAuthLock,
  },
  realtime: {
    heartbeatIntervalMs: 25_000,
    worker: true,
    heartbeatCallback: (status) => {
      if (status === 'disconnected' || status === 'timeout') {
        logRealtime.warn('Heartbeat status', { status });
        if (status === 'disconnected') {
          consecutiveDisconnected += 1;
          if (consecutiveDisconnected >= RECOVERY_DISCONNECTED_THRESHOLD) {
            tryForceRealtimeRecovery();
          }
        }
      } else {
        // 'sent' | 'received' → heartbeat alive; reset counter.
        consecutiveDisconnected = 0;
      }
    },
  },
});

supabaseRef = supabase;
