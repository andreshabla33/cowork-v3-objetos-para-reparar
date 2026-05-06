/**
 * @module modules/realtime-room/presentation/useLiveKitZombieCleanup
 * @description Sub-hook of the P0-03 useLiveKit decomposition: detects
 * "zombie" peers (LiveKit `ConnectionQuality.Lost` sustained for 3 s) and
 * forces a local-only cleanup of their state, without touching server-side
 * room membership.
 *
 * Single responsibility: zombie-peer detection + local cleanup. Publishes
 * the `onConnectionQualityChanged` handler via output ref consumed by the
 * Coordinator factory in Lifecycle.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs:
 *   - https://docs.livekit.io/reference/client-sdk-js/enums/ConnectionQuality.html
 *   - https://docs.livekit.io/home/client/events/ (ConnectionQualityChanged)
 */

import { useCallback, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

const log = logger.child('useLiveKit-zombie-cleanup');
const ZOMBIE_GRACE_MS = 3000;

export interface UseLiveKitZombieCleanupParams {
  setRemoteParticipantIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRemoteStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setRemoteScreenStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setRemoteAudioTracks: React.Dispatch<React.SetStateAction<Map<string, MediaStreamTrack>>>;
  recordTelemetry: (
    name: string,
    data?: Record<string, unknown>,
    severity?: 'info' | 'warn' | 'error',
    category?: 'remote_media' | 'subscription_policy' | 'meeting_access' | 'meeting_realtime' | 'meeting_quality' | 'space_realtime',
  ) => void;
  onConnectionQualityChangedOutRef: React.MutableRefObject<
    ((participantId: string, quality: string) => void) | null
  >;
}

export interface UseLiveKitZombieCleanupReturn {
  /** Drop all pending zombie timers — invoked by Lifecycle's limpiarLivekit. */
  resetZombieTimers: () => void;
}

export function useLiveKitZombieCleanup(
  params: UseLiveKitZombieCleanupParams,
): UseLiveKitZombieCleanupReturn {
  const {
    setRemoteParticipantIds,
    setRemoteStreams,
    setRemoteScreenStreams,
    setRemoteAudioTracks,
    recordTelemetry,
    onConnectionQualityChangedOutRef,
  } = params;

  const zombiePeerTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // LiveKit explicitly documents Lost as potentially "temporarily" lost. Local
  // cleanup hides the peer; if quality recovers we cancel the timer; if the peer
  // genuinely returns it re-appears via ParticipantConnected/broadcast.
  useEffect(() => {
    onConnectionQualityChangedOutRef.current = (participantId, quality) => {
      const existing = zombiePeerTimersRef.current.get(participantId);
      if (quality === 'lost') {
        if (existing) return;
        const timer = setTimeout(() => {
          zombiePeerTimersRef.current.delete(participantId);
          log.warn('Peer marked zombie (ConnectionQuality.Lost sustained 3s)', { participantId });
          recordTelemetry('peer_marked_zombie', {
            participantId,
            reason: 'connection_quality_lost_sustained',
            graceMs: ZOMBIE_GRACE_MS,
          }, 'warn');
          setRemoteParticipantIds((prev) => {
            if (!prev.has(participantId)) return prev;
            const n = new Set(prev); n.delete(participantId); return n;
          });
          setRemoteStreams((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
          setRemoteScreenStreams((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
          setRemoteAudioTracks((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
        }, ZOMBIE_GRACE_MS);
        zombiePeerTimersRef.current.set(participantId, timer);
      } else if (existing) {
        clearTimeout(existing);
        zombiePeerTimersRef.current.delete(participantId);
      }
    };
  }, [
    onConnectionQualityChangedOutRef,
    setRemoteParticipantIds,
    setRemoteStreams,
    setRemoteScreenStreams,
    setRemoteAudioTracks,
    recordTelemetry,
  ]);

  const resetZombieTimers = useCallback(() => {
    zombiePeerTimersRef.current.forEach((t) => clearTimeout(t));
    zombiePeerTimersRef.current.clear();
  }, []);

  return { resetZombieTimers };
}
