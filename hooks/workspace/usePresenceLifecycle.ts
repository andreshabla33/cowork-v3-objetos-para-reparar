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

interface UsePresenceLifecycleParams {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  currentUser: User;
  syncPresenceByChunk: () => void;
  updatePresenceInChannels: (nivel: 'publico' | 'empresa') => Promise<void>;
  forceRetrackAll: () => void;
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

  // ── 3. Force re-track when empresa_id loads for the first time ────────
  // Ensures all channel payloads carry the correct empresa_id and triggers
  // recalculation with authoritative same-company detection.
  useEffect(() => {
    if (currentUser.empresa_id && !empresaIdLoadedRef.current) {
      empresaIdLoadedRef.current = true;
      const timer = setTimeout(() => forceRetrackAll(), 500);
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
}
