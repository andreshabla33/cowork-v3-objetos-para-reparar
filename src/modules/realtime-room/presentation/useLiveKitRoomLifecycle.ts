/**
 * @module modules/realtime-room/presentation/useLiveKitRoomLifecycle
 * @description Sub-hook of the P0-03 useLiveKit decomposition: owns the
 * LiveKit Room connection lifecycle. Handles token retrieval,
 * SpaceRealtimeCoordinator construction (wiring callback refs from the
 * other sub-hooks), participant connect/disconnect/reconnected handling
 * with multi-Room awareness, the auto-connect grace period (60s) when
 * alone in the space, and the page-exit teardown via pagehide/beforeunload.
 *
 * Single responsibility: room lifecycle. Track-level cleanup is delegated
 * to RemoteTracks via injected helpers; subscription-policy cache reset
 * goes through the late-binding ref published by RemoteSubscriptions; the
 * speaking-users reset and zombie-timer reset use the same pattern.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs (livekit-client / docs.livekit.io):
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/Room.html
 *     (Room.remoteParticipants — authoritative race-free identity set)
 *   - https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html
 *     (Participant lifecycle — Reconnecting/Reconnected, identity stable
 *      across reconnects)
 *   - https://docs.livekit.io/home/server/managing-rooms/ (moveParticipant)
 *   - Room.disconnect() flushes SIGNAL_LEAVE — required from pagehide so
 *     remote peers see us drop without waiting for ICE timeout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Room, RemoteParticipant, Track, TrackPublication } from 'livekit-client';
import type { User, Workspace } from '@/types';
import { logger } from '@/lib/logger';
import { avatarStore } from '@/lib/ecs/AvatarECS';
import { useStore } from '@/store/useStore';
import { crearSalaLivekitPorEspacio, obtenerTokenLivekitEspacio } from '@/lib/livekitService';
import { supabase } from '@/lib/supabase';
import { getTurnIceServers } from '@/lib/network/turnCredentialsService';
import {
  type SpaceRealtimeCoordinatorState,
  type RealtimeEventBus,
  SpaceRealtimeCoordinator,
} from '@/modules/realtime-room';
import type { RemoteMediaLifecycleEvent } from '@/modules/realtime-room/application/RemoteMediaLifecycleDiagnostics';
import type { RealtimePositionEntry } from '@/hooks/space3d/types';

const log = logger.child('useLiveKit-room-lifecycle');
const IDLE_DISCONNECT_GRACE_MS = 60_000;

type RemoteTrackHandler = (
  track: Track,
  pub: TrackPublication,
  participant: RemoteParticipant,
) => void;

type ConnectionQualityHandler = (participantId: string, quality: string) => void;

type SpeakerChangeHandler = (speakerIds: string[]) => void;

export interface UseLiveKitRoomLifecycleParams {
  activeWorkspace: Workspace | null;
  session: Session | null;
  currentUser: User;
  onlineUsers: User[];
  livekitRoomNameRef: React.MutableRefObject<string | null>;

  // Callback refs published by sibling sub-hooks. Read lazily inside the
  // Coordinator constructor — sub-hooks may not have populated them yet at
  // hook-init order, but they will be populated by render commit.
  onRemoteTrackSubscribedRef: React.MutableRefObject<RemoteTrackHandler | null>;
  onRemoteTrackUnsubscribedRef: React.MutableRefObject<RemoteTrackHandler | null>;
  onSpeakerChangeRef: React.MutableRefObject<SpeakerChangeHandler | null>;
  onConnectionQualityChangedRef: React.MutableRefObject<ConnectionQualityHandler | null>;

  // Cleanup helpers (eager, available at hook init).
  cleanupParticipantTracks: (participantId: string) => void;
  cleanupStaleParticipants: (activeIds: Set<string>) => void;
  resetAllRemoteTracksState: () => void;

  // Late-binding resets (refs populated by sibling sub-hooks). Using a ref
  // for `resetSpeakingUsers` (instead of a direct callback prop) keeps
  // `limpiarLivekit`'s identity stable across renders — otherwise the
  // unmount cleanup `useEffect(... , [limpiarLivekit])` re-fires on every
  // render and calls `room.disconnect()` mid-handshake, cancelling connect
  // (regression bug observed on Vercel preview of commit 1f4a8ab).
  resetSpeakingUsersRef: React.MutableRefObject<(() => void) | null>;
  zombieResetRef: React.MutableRefObject<(() => void) | null>;
  subscriptionPolicyResetRef: React.MutableRefObject<(() => void) | null>;

  realtimePositionsRef?: React.MutableRefObject<Map<string, RealtimePositionEntry>>;

  recordTelemetry: (
    name: string,
    data?: Record<string, unknown>,
    severity?: 'info' | 'warn' | 'error',
    category?: 'remote_media' | 'subscription_policy' | 'meeting_access' | 'meeting_realtime' | 'meeting_quality' | 'space_realtime',
  ) => void;
  logRemoteMediaLifecycle: (event: RemoteMediaLifecycleEvent, payload?: Record<string, unknown>) => void;
}

export interface UseLiveKitRoomLifecycleReturn {
  livekitRoomRef: React.MutableRefObject<Room | null>;
  realtimeCoordinatorRef: React.MutableRefObject<SpaceRealtimeCoordinator | null>;
  realtimeEventBusRef: React.MutableRefObject<RealtimeEventBus | null>;
  realtimeCoordinatorState: SpaceRealtimeCoordinatorState | null;
  livekitConnected: boolean;
  remoteParticipantIds: Set<string>;
  setRemoteParticipantIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  conectarLivekit: (roomName: string) => Promise<void>;
  limpiarLivekit: () => Promise<void>;
}

export function useLiveKitRoomLifecycle(
  params: UseLiveKitRoomLifecycleParams,
): UseLiveKitRoomLifecycleReturn {
  const {
    activeWorkspace, session, currentUser, onlineUsers,
    livekitRoomNameRef,
    onRemoteTrackSubscribedRef, onRemoteTrackUnsubscribedRef,
    onSpeakerChangeRef, onConnectionQualityChangedRef,
    cleanupParticipantTracks, cleanupStaleParticipants,
    resetAllRemoteTracksState,
    resetSpeakingUsersRef, zombieResetRef, subscriptionPolicyResetRef,
    realtimePositionsRef,
    recordTelemetry, logRemoteMediaLifecycle,
  } = params;

  const [livekitConnected, setLivekitConnected] = useState(false);
  const [realtimeCoordinatorState, setRealtimeCoordinatorState] = useState<SpaceRealtimeCoordinatorState | null>(null);
  const [remoteParticipantIds, setRemoteParticipantIds] = useState<Set<string>>(new Set());

  const livekitRoomRef = useRef<Room | null>(null);
  const livekitConnectingRef = useRef(false);
  const realtimeCoordinatorRef = useRef<SpaceRealtimeCoordinator | null>(null);
  const realtimeEventBusRef = useRef<RealtimeEventBus | null>(null);

  // Mirror participant set to Zustand so WorkspaceLayout can gate
  // onlineUsers (Supabase Presence ghosts) by LiveKit's race-free identity set.
  const setRemoteParticipantIdsInStore = useStore((s) => s.setRemoteParticipantIds);
  useEffect(() => {
    setRemoteParticipantIdsInStore(remoteParticipantIds);
  }, [remoteParticipantIds, setRemoteParticipantIdsInStore]);

  // Trigger a welcome broadcast from Player3D so newcomers learn our position
  // immediately instead of waiting up to 2s for the next idle heartbeat.
  const bumpParticipantJoinVersion = useStore((s) => s.bumpParticipantJoinVersion);

  // Ref synced to onlineUsers — needed inside onParticipantDisconnected to
  // distinguish "peer left the space" vs "peer moved to another LiveKit Room"
  // (multi-Room meetings).
  const onlineUsersRef = useRef<User[]>(onlineUsers);
  onlineUsersRef.current = onlineUsers;

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const limpiarLivekit = useCallback(async () => {
    const room = livekitRoomRef.current;
    if (room) {
      room.removeAllListeners();
    }
    realtimeCoordinatorRef.current?.disconnect();
    realtimeCoordinatorRef.current = null;
    realtimeEventBusRef.current = null;
    resetAllRemoteTracksState();
    livekitRoomRef.current = null;
    livekitRoomNameRef.current = null;
    setLivekitConnected(false);
    setRealtimeCoordinatorState(null);
    setRemoteParticipantIds(new Set());
    resetSpeakingUsersRef.current?.();
    zombieResetRef.current?.();
    subscriptionPolicyResetRef.current?.();
  }, [
    livekitRoomNameRef, resetAllRemoteTracksState,
    resetSpeakingUsersRef, zombieResetRef, subscriptionPolicyResetRef,
  ]);

  // ─── Connect ───────────────────────────────────────────────────────────────
  const conectarLivekit = useCallback(async (roomName: string) => {
    if (!activeWorkspace?.id || !session?.access_token) return;
    if (livekitRoomNameRef.current === roomName) return;
    if (livekitConnectingRef.current) return;

    try {
      livekitConnectingRef.current = true;
      await limpiarLivekit();

      const tokenData = await obtenerTokenLivekitEspacio({
        roomName,
        espacioId: activeWorkspace.id,
        accessToken: session.access_token,
        empresaId: currentUser.empresa_id,
        departamentoId: currentUser.departamento_id,
      });

      const coordinator = new SpaceRealtimeCoordinator({
        serverUrl: tokenData.url,
        token: tokenData.token,
        iceServerProvider: () => getTurnIceServers(supabase),
        onConnectionChange: (connected) => {
          setLivekitConnected(connected);
          if (!connected) {
            livekitRoomNameRef.current = null;
            livekitRoomRef.current = null;
          }
        },
        onStateChange: setRealtimeCoordinatorState,
        onRemoteTrackSubscribed: (track, pub, participant) => {
          onRemoteTrackSubscribedRef.current?.(track, pub, participant);
        },
        onRemoteTrackUnsubscribed: (track, pub, participant) => {
          onRemoteTrackUnsubscribedRef.current?.(track, pub, participant);
        },
        onParticipantDisconnected: (participant) => {
          logRemoteMediaLifecycle('participant_disconnected', { participantId: participant.identity });
          cleanupParticipantTracks(participant.identity);
          setRemoteParticipantIds((prev) => {
            const n = new Set(prev);
            n.delete(participant.identity);
            return n;
          });

          // CRÍTICO (2026-04-23): con multi-Room meetings, un peer que se mueve
          // a otra Room dispara ParticipantDisconnected aquí aunque siga
          // globalmente online via Supabase Presence. Si borrásemos su avatar,
          // el peer "desaparecería" del mapa 3D (bug ROLE-MISMATCH).
          const stillInPresence = onlineUsersRef.current.some((u) => u.id === participant.identity);
          if (!stillInPresence) {
            // Disconnect abrupto donde Presence 'leave' tarda o se pierde — drop ECS para liberar GPU.
            avatarStore.remove(participant.identity);
            realtimePositionsRef?.current.delete(participant.identity);
          } else {
            // Room transition smoothing: si sigue en Presence, este disconnect
            // probablemente es transitorio (moveParticipant + posible reconnect).
            // Congelamos el target para evitar saltos al reconnect.
            // Ref: https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html
            const entity = avatarStore.get(participant.identity);
            if (entity) {
              entity.targetX = entity.currentX;
              entity.targetZ = entity.currentZ;
              entity.isMoving = false;
            }
          }
        },
        onParticipantConnected: (participant) => {
          setRemoteParticipantIds((prev) => {
            if (prev.has(participant.identity)) return prev;
            const n = new Set(prev);
            n.add(participant.identity);
            return n;
          });
          bumpParticipantJoinVersion();
        },
        // Multi-Room meetings: tras moveParticipant, room.remoteParticipants
        // queda con los peers de la Room destino. Re-seedamos el set + limpiamos
        // estado de peers de la Room origen (streams/policy caches/listeners).
        // Ref: https://docs.livekit.io/home/server/managing-rooms/
        onReconnected: (room: Room) => {
          const nextIds = new Set(room.remoteParticipants.keys());
          setRemoteParticipantIds(nextIds);
          cleanupStaleParticipants(nextIds);
          subscriptionPolicyResetRef.current?.();
          // Nota: NO tocamos avatarStore aquí. Avatares 3D vienen de Supabase
          // Presence (visibles cross-Room); la media se gatea por
          // remoteParticipantIds en useProximity.
          log.info('Room reconnected — participant set resynced', {
            remoteParticipantCount: nextIds.size,
            identities: Array.from(nextIds),
          });
          recordTelemetry('livekit_reconnected_resynced', {
            remoteParticipantCount: nextIds.size,
          });
        },
        onSpeakerChange: (speakerIds) => {
          onSpeakerChangeRef.current?.(speakerIds);
        },
        onConnectionQualityChanged: (participantId, quality) => {
          onConnectionQualityChangedRef.current?.(participantId, quality);
        },
      });

      realtimeCoordinatorRef.current = coordinator;
      realtimeEventBusRef.current = coordinator.getEventBus();
      const connected = await coordinator.connect();
      const room = coordinator.getRoom();
      if (!connected || !room) {
        realtimeCoordinatorRef.current = null;
        realtimeEventBusRef.current = null;
        livekitRoomNameRef.current = null;
        livekitRoomRef.current = null;
        setLivekitConnected(false);
        setRealtimeCoordinatorState(null);
        return;
      }

      livekitRoomRef.current = room;
      livekitRoomNameRef.current = roomName;
      setRemoteParticipantIds(new Set(room.remoteParticipants.keys()));
      log.info('Connected to room', { roomName, remoteParticipants: room.remoteParticipants.size });
      recordTelemetry('livekit_connected', {
        roomName,
        remoteParticipants: room.remoteParticipants.size,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown';
      log.error('Connection failed', { roomName, error: errorMessage });
      recordTelemetry('livekit_connection_failed', { roomName, message: errorMessage }, 'error');
      livekitRoomNameRef.current = null;
      livekitRoomRef.current = null;
      realtimeCoordinatorRef.current = null;
      realtimeEventBusRef.current = null;
      setLivekitConnected(false);
      setRealtimeCoordinatorState(null);
    } finally {
      livekitConnectingRef.current = false;
    }
  }, [
    activeWorkspace?.id, session?.access_token,
    currentUser.empresa_id, currentUser.departamento_id,
    livekitRoomNameRef, limpiarLivekit,
    onRemoteTrackSubscribedRef, onRemoteTrackUnsubscribedRef,
    onSpeakerChangeRef, onConnectionQualityChangedRef,
    cleanupParticipantTracks, cleanupStaleParticipants,
    subscriptionPolicyResetRef,
    realtimePositionsRef,
    bumpParticipantJoinVersion,
    recordTelemetry, logRemoteMediaLifecycle,
  ]);

  // ─── Auto-connect / disconnect ─────────────────────────────────────────────
  const hayOtrosUsuariosOnline = onlineUsers.length > 0;
  const hayOtrosUsuariosRef = useRef(hayOtrosUsuariosOnline);
  hayOtrosUsuariosRef.current = hayOtrosUsuariosOnline;

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    if (hayOtrosUsuariosOnline) {
      const roomName = crearSalaLivekitPorEspacio(activeWorkspace.id);
      conectarLivekit(roomName).catch((e: unknown) =>
        log.error('Auto-connect failed', { error: e instanceof Error ? e.message : String(e) }),
      );
    } else {
      // Idle grace 60s before disconnecting LiveKit when alone — was 5s but
      // that lost reconnect cycles for tab close+reopen, dropping DataPackets
      // of position. 60s leaves headroom for reloads without giving up the
      // cost-saving idle disconnect.
      const timer = setTimeout(() => {
        if (!hayOtrosUsuariosRef.current && livekitRoomRef.current) {
          limpiarLivekit().catch(() => {});
        }
      }, IDLE_DISCONNECT_GRACE_MS);
      return () => clearTimeout(timer);
    }
  }, [activeWorkspace?.id, hayOtrosUsuariosOnline, conectarLivekit, limpiarLivekit]);

  useEffect(() => {
    return () => { limpiarLivekit().catch(() => {}); };
  }, [limpiarLivekit]);

  // Page-exit: room.disconnect() flushes SIGNAL_LEAVE so remote peers see us
  // drop now instead of waiting for the server's peer-connection timeout.
  // pagehide is reliable on mobile + bfcache; beforeunload covers desktop.
  useEffect(() => {
    const handlePageExit = () => {
      limpiarLivekit().catch(() => {});
    };
    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);
    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [limpiarLivekit]);

  return {
    livekitRoomRef,
    realtimeCoordinatorRef,
    realtimeEventBusRef,
    realtimeCoordinatorState,
    livekitConnected,
    remoteParticipantIds,
    setRemoteParticipantIds,
    conectarLivekit,
    limpiarLivekit,
  };
}
