/**
 * @module hooks/workspace/usePresenceLifecycle
 * @description Application-layer hook that orchestrates the lifecycle of
 * Supabase Realtime presence channels within the workspace.
 *
 * Consolidates formerly scattered useEffects from WorkspaceLayout:
 * 1. Subscribe/unsubscribe on workspace change + empresa_id load
 * 2. Re-sync on position/empresa_id change
 * 3. Force re-track when empresa_id loads for the first time
 * 4. Update presence when user state changes (mic, cam, status, position)
 * 5. Periodic health check to detect and recover dead channels
 *
 * This eliminates the duplicated syncPresenceByChunk calls and the
 * dangling empresaIdLoadedRef that was declared inline in WorkspaceLayout.
 *
 * Clean Architecture: Application layer — orchestrates Infrastructure hooks
 * (usePresenceChannels) without containing Supabase/Realtime details.
 *
 * Ref: react.dev "Reusing Logic with Custom Hooks" —
 *      "extract logic into custom Hooks to hide gnarly details"
 * Ref: Supabase docs "heartbeatCallback" — "provides visibility into the
 *      connection's health and a mechanism for explicit reconnection"
 * Ref: supabase/realtime-js — CLOSED channels have no auto-recovery;
 *      periodic health check fills that gap.
 */

import { useEffect, useRef } from 'react';
import type { User } from '@/types';
import { logger } from '@/core/infrastructure/observability/logger';
import type { ForceRetrackReason } from './usePresenceChannels';

const log = logger.child('presence-lifecycle');

/**
 * Interval (ms) for the periodic channel health check.
 *
 * Values evaluated:
 * - 5s: aggressive, catches issues fast but adds CPU churn from
 *   iterating all channels every 5s.
 * - 10s (chosen): good balance between detection speed and overhead.
 *   A 10s gap means an avatar might be invisible for up to ~13s
 *   (10s detection + 3s first retry) — acceptable given the 2s
 *   sync throttle already in place.
 * - 30s: too slow — user perceives broken state for too long.
 */
const HEALTH_CHECK_INTERVAL_MS = 10_000;

/**
 * Interval (ms) for the periodic presence re-track ("keep-alive").
 *
 * FIX 2026-05-12 ghost user mitigation (iter 2). Cada 45s re-trackeamos el
 * payload con `last_seen: Date.now()` para que peers no nos marquen stale
 * (umbral = 60s).
 *
 * 45s elegido para:
 *   - Match el `trackThrottleMs=45s` natural de updatePresenceInChannels:
 *     consistencia entre keep-alive periódico y track-on-state-change.
 *   - Mantener throughput aceptable: 11-16 channels × 1 track/45s ≈ 0.3-0.4
 *     tracks/seg (vs ~3 tracks/seg con el iter 1 de 5s).
 *
 * Iter 1 usaba 5s → cada track() genera nuevo presence_ref → server fire
 * LEAVE del ref previo → cascade de events + chunk channels CLOSED bajo
 * carga. Confirmado en logs (2026-05-12) y en realtime-js RealtimePresence.ts.
 *
 * Ref: https://supabase.com/docs/guides/realtime/presence
 */
const PRESENCE_REFRESH_MS = 45_000;

interface UsePresenceLifecycleParams {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  currentUser: User;
  syncPresenceByChunk: (options?: { force?: boolean }) => void;
  updatePresenceInChannels: (nivel: 'publico' | 'empresa') => Promise<void>;
  forceRetrackAll: (reason: ForceRetrackReason) => void;
  cleanup: () => void;
  /**
   * Inspects channels for dead states and purges them.
   * Provided by usePresenceChannels.
   */
  checkChannelHealth: () => void;
}

/**
 * Manages the full presence lifecycle:
 * - Subscribe when workspace + empresa_id are ready
 * - Re-sync on chunk movement
 * - Force re-track on first empresa_id load
 * - Update presence payloads on user state changes
 */
export function usePresenceLifecycle({
  activeWorkspaceId,
  userId,
  currentUser,
  syncPresenceByChunk,
  updatePresenceInChannels,
  forceRetrackAll,
  cleanup,
  checkChannelHealth,
}: UsePresenceLifecycleParams): void {
  const empresaIdLoadedRef = useRef(false);
  /**
   * One-shot guard for the sentinel→real position transition.
   *
   * Bug que cubre (2026-05-08): cuando un usuario se conecta, su slot
   * `currentUser.x/y` arranca en (0,0) (sentinel oficial — ver
   * `store/slices/authSlice.ts:55-56`). El primer `syncPresenceByChunk`
   * suscribe canales contra ese (0,0). Cuando 500-1500 ms más tarde el
   * Player3D hidrata la posición real (spawnPersonal / zonaEmpresa /
   * BD), `currentUser.x/y` cambia y `usePresenceLifecycle` (efecto #2
   * abajo) llama otra vez a `syncPresenceByChunk` — pero la policy lo
   * **THROTTLEA** porque `syncThrottleMs=2000` ya transcurrió < 2 s.
   * Resultado: los chunks quedan congelados en el chunk del sentinel
   * (~chunk_2_2 con el viejo default 500,500, o chunk_0_0 con el nuevo)
   * mientras el avatar realmente está en otro chunk → otros usuarios
   * jamás reciben la posición real vía presence (sólo vía global empresa
   * discovery channel, que también está stuck en (0,0) por el
   * `trackThrottleMs=45_000` del propio `updatePresenceInChannels`).
   * Cuando los DataPackets de LiveKit se demoran más que la ventana de
   * frescura ECS (2 s) por jitter de red, el render cae al fallback de
   * presence — que tras este fix preserva (0,0) y `useProximity` filtra,
   * pero ANTES caía en `||500` y co-localizaba a todos en (500,500).
   *
   * Refs:
   *   - https://supabase.com/docs/guides/realtime/presence (track/sync)
   *   - https://docs.livekit.io/home/client/data/packets/ (data channel)
   */
  const positionHydratedRef = useRef(false);

  // ── 1. Subscribe/unsubscribe on workspace + empresa_id ────────────────
  // Single effect replaces 2 duplicates. The dependency on empresa_id
  // ensures re-subscription when it loads (deferred by the guard in
  // syncPresenceByChunk). Cleanup runs on unmount or workspace change.
  useEffect(() => {
    if (!activeWorkspaceId || !userId) return;
    syncPresenceByChunk();
    return () => { cleanup(); };
  }, [activeWorkspaceId, userId, currentUser.empresa_id, syncPresenceByChunk, cleanup]);

  // ── 2. Re-sync on position change (chunk transition) ──────────────────
  // Separate from above to avoid cleanup/re-subscribe on every move.
  // Only calls syncPresenceByChunk (no cleanup) so existing channels persist.
  useEffect(() => {
    if (!activeWorkspaceId || !userId) return;
    syncPresenceByChunk();
  }, [activeWorkspaceId, userId, currentUser.x, currentUser.y, syncPresenceByChunk]);

  // ── 2b. Force-sync on first sentinel→real transition ──────────────────
  // El sync regular del efecto #2 está sujeto al `syncThrottleMs=2000` de la
  // policy. La primera hidratación suele caer DENTRO de la ventana del
  // throttle (la suscripción inicial fija `lastSyncRef.current = now`), por
  // lo que `decision.shouldSkip = true` y los chunks no se actualizan.
  // Aquí forzamos UNA vez la operación ignorando el throttle, y además
  // re-trackeamos todos los canales (incluido el global empresa discovery)
  // para que la posición real se propague vía presence inmediatamente —
  // sin esperar el `trackThrottleMs=45_000` de `updatePresenceInChannels`.
  useEffect(() => {
    if (!activeWorkspaceId || !userId) return;
    if (positionHydratedRef.current) return;
    if (currentUser.x === 0 && currentUser.y === 0) return;
    positionHydratedRef.current = true;
    syncPresenceByChunk({ force: true });
    forceRetrackAll('position-hydrated');
  }, [activeWorkspaceId, userId, currentUser.x, currentUser.y, syncPresenceByChunk, forceRetrackAll]);

  // ── 3. Force re-track when empresa_id loads for the first time ────────
  // Ensures all channel payloads carry the correct empresa_id and triggers
  // recalculation with authoritative same-company detection.
  useEffect(() => {
    if (currentUser.empresa_id && !empresaIdLoadedRef.current) {
      empresaIdLoadedRef.current = true;
      const timer = setTimeout(() => forceRetrackAll('empresa-id-loaded'), 500);
      return () => clearTimeout(timer);
    }
    if (!currentUser.empresa_id) {
      empresaIdLoadedRef.current = false;
    }
  }, [currentUser.empresa_id, forceRetrackAll]);

  // ── 4. Update presence payload on user state changes ──────────────────
  useEffect(() => {
    if (!userId) return;
    updatePresenceInChannels('empresa');
  }, [
    currentUser.x,
    currentUser.y,
    currentUser.isMicOn,
    currentUser.isCameraOn,
    currentUser.status,
    currentUser.empresa_id,
    userId,
    updatePresenceInChannels,
  ]);

  // ── 5. Periodic channel health check ─────────────────────────────────
  // (Page-exit untrack moved to WorkspaceLayout to avoid unmount race)
  // Detects channels stuck in dead states (errored, closed) that the
  // subscribe callback might have missed (race, silent disconnect, etc.)
  // and triggers recovery. Without this, a WS drop (ERR_CONNECTION_CLOSED)
  // during channel subscription leaves the channel zombie forever —
  // the ref blocks recreation and no online users are ever detected.
  //
  // Ref: Supabase docs — "heartbeatCallback [...] provides visibility
  //      into the connection's health and a mechanism for explicit
  //      reconnection when the connection is lost."
  // Ref: supabase/realtime-js — CLOSED channels have NO rejoinTimer.
  useEffect(() => {
    if (!activeWorkspaceId || !userId) return;
    const interval = setInterval(checkChannelHealth, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeWorkspaceId, userId, checkChannelHealth]);

  // ── 6. Periodic presence re-track (keep-alive vs ghost users) ─────────
  // FIX 2026-05-12 ghost user. Refresca `last_seen` en todos los canales
  // cada PRESENCE_REFRESH_MS (5s), aunque el user no se mueva. Sin esto,
  // un user estático aparece como fantasma a peers después de 15s sin
  // movement → el aggregator client-side lo filtra por error.
  //
  // Por qué setInterval + forceRetrackAll (no updatePresenceInChannels):
  //   - updatePresenceInChannels tiene throttle interno de 45s → no sirve.
  //   - forceRetrackAll bypassa todos los throttles. Es una operación
  //     barata (track con payload cached, sin IO adicional).
  //
  // Si user untracked (page-exit), peers detectan ausencia por dos vías:
  //   1. untrack explícito (preferred — pagehide en WorkspaceLayout)
  //   2. last_seen stale > 15s (fallback si untrack no propagó)
  //
  // Ref: Supabase Presence — "track(): Send presence to the channel."
  useEffect(() => {
    if (!activeWorkspaceId || !userId) return;
    const interval = setInterval(() => forceRetrackAll('keep-alive'), PRESENCE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeWorkspaceId, userId, forceRetrackAll]);
}
