/**
 * @module hooks/workspace/usePresenceLifecycle
 * @description Application-layer hook that orchestrates the lifecycle of
 * Supabase Realtime presence channels within the workspace.
 *
 * Consolidates 3 formerly scattered useEffects from WorkspaceLayout:
 * 1. Subscribe/unsubscribe on workspace change + empresa_id load
 * 2. Re-sync on position/empresa_id change
 * 3. Force re-track when empresa_id loads for the first time
 * 4. Update presence when user state changes (mic, cam, status, position)
 *
 * This eliminates the duplicated syncPresenceByChunk calls and the
 * dangling empresaIdLoadedRef that was declared inline in WorkspaceLayout.
 *
 * Clean Architecture: Application layer — orchestrates Infrastructure hooks
 * (usePresenceChannels) without containing Supabase/Realtime details.
 *
 * Ref: react.dev "Reusing Logic with Custom Hooks" —
 *      "extract logic into custom Hooks to hide gnarly details"
 */

import { useEffect, useRef } from 'react';
import type { User } from '@/types';

interface UsePresenceLifecycleParams {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  currentUser: User;
  syncPresenceByChunk: () => void;
  updatePresenceInChannels: (nivel: 'publico' | 'empresa') => Promise<void>;
  forceRetrackAll: () => void;
  cleanup: () => void;
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
}
