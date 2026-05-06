/**
 * @module hooks/space3d/useLiveKit
 * @description Compat shim composing the 8 sub-hooks from
 * `src/modules/realtime-room/presentation/` (P0-03 split). Preserves the
 * legacy `UseLiveKitReturn` surface 1:1 so `useSpace3D` and the rest of
 * the consumers keep working unchanged while the bounded-context module
 * is the new source of truth.
 *
 * Architecture: hook composer. Each sub-hook owns one responsibility
 * (telemetry, room lifecycle, local publishing, remote subscriptions,
 * remote tracks, speaker detection, zombie cleanup, data publish). The
 * Coordinator is constructed once inside Lifecycle, with sibling sub-hook
 * callbacks wired through stable refs published by their owners.
 *
 * @deprecated The legacy hook name is preserved for now. Roadmap tracks
 * renaming this composer to `useRealtimeRoom` in a follow-up PR (separate
 * from the structural split, to avoid mixing rename with consumers).
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs: see each sub-hook's docstring for the LiveKit doc citations.
 */

import { useCallback, useRef } from 'react';
import type { Track, TrackPublication, RemoteParticipant } from 'livekit-client';
import type { Session } from '@supabase/supabase-js';
import type { User, Workspace } from '@/types';
import type {
  SpaceMediaCoordinatorState,
} from '@/modules/realtime-room';
import type { UseLiveKitReturn, RealtimePositionEntry } from './types';

import { useLiveKitTelemetry } from '@/modules/realtime-room/presentation/useLiveKitTelemetry';
import { useLiveKitSpeakerDetection } from '@/modules/realtime-room/presentation/useLiveKitSpeakerDetection';
import { useLiveKitRemoteTracks } from '@/modules/realtime-room/presentation/useLiveKitRemoteTracks';
import { useLiveKitZombieCleanup } from '@/modules/realtime-room/presentation/useLiveKitZombieCleanup';
import { useLiveKitRoomLifecycle } from '@/modules/realtime-room/presentation/useLiveKitRoomLifecycle';
import { useLiveKitRemoteSubscriptions } from '@/modules/realtime-room/presentation/useLiveKitRemoteSubscriptions';
import { useLiveKitLocalPublishing } from '@/modules/realtime-room/presentation/useLiveKitLocalPublishing';
import { useLiveKitDataChannel } from '@/modules/realtime-room/presentation/useLiveKitDataChannel';

type RemoteTrackHandler = (track: Track, pub: TrackPublication, participant: RemoteParticipant) => void;

export function useLiveKit(params: {
  activeWorkspace: Workspace | null;
  session: Session | null;
  currentUser: User;
  empresasAutorizadas: string[];
  onlineUsers: User[];
  activeStreamRef: React.MutableRefObject<MediaStream | null>;
  activeScreenRef: React.MutableRefObject<MediaStream | null>;
  desiredMediaState: { isMicrophoneEnabled: boolean; isCameraEnabled: boolean; isScreenShareEnabled: boolean };
  mediaCoordinatorState: SpaceMediaCoordinatorState | null;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraSettings: { backgroundEffect: string };
  performanceSettings?: { graphicsQuality?: string; batterySaver?: boolean };
  hasActiveCall: boolean;
  usersInCall: User[];
  usersInAudioRange: User[];
  conversacionesBloqueadasRemoto: Map<string, string[]>;
  realtimePositionsRef?: React.MutableRefObject<Map<string, RealtimePositionEntry>>;
}): UseLiveKitReturn {
  const {
    activeWorkspace, session, currentUser, empresasAutorizadas, onlineUsers,
    activeStreamRef, activeScreenRef,
    desiredMediaState, mediaCoordinatorState,
    stream, screenStream,
    performanceSettings,
    hasActiveCall, usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto,
    realtimePositionsRef,
  } = params;

  const isMicrophoneEnabled = mediaCoordinatorState?.desiredMicrophoneEnabled
    ?? mediaCoordinatorState?.isMicrophoneEnabled
    ?? desiredMediaState.isMicrophoneEnabled;
  const isCameraEnabled = mediaCoordinatorState?.desiredCameraEnabled
    ?? mediaCoordinatorState?.isCameraEnabled
    ?? desiredMediaState.isCameraEnabled;
  const isScreenShareEnabled = mediaCoordinatorState?.desiredScreenShareEnabled
    ?? mediaCoordinatorState?.screenShareSession.active
    ?? desiredMediaState.isScreenShareEnabled;

  // ─── Cross-empresa filter (used by RemoteTracks + exposed publicly) ────────
  const obtenerEmpresaParticipante = useCallback((metadata?: string | null) => {
    if (!metadata) return null;
    try { return JSON.parse(metadata)?.empresa_id ?? null; } catch { return null; }
  }, []);

  const permitirMediaParticipante = useCallback((metadata?: string | null) => {
    if (!currentUser.empresa_id) return true;
    const empresaParticipante = obtenerEmpresaParticipante(metadata);
    if (!empresaParticipante) return true;
    if (empresaParticipante === currentUser.empresa_id) return true;
    return empresasAutorizadas.includes(empresaParticipante);
  }, [currentUser.empresa_id, obtenerEmpresaParticipante, empresasAutorizadas]);

  // ─── Shared refs (cross-hook callback wiring) ──────────────────────────────
  // Lifecycle reads these `.current` lazily inside conectarLivekit, after
  // sibling sub-hooks have populated them on their first render commit.
  const livekitRoomNameRef = useRef<string | null>(null);
  const onRemoteTrackSubscribedRef = useRef<RemoteTrackHandler | null>(null);
  const onRemoteTrackUnsubscribedRef = useRef<RemoteTrackHandler | null>(null);
  const onSpeakerChangeRef = useRef<((speakerIds: string[]) => void) | null>(null);
  const onConnectionQualityChangedRef = useRef<((id: string, quality: string) => void) | null>(null);
  const subscriptionPolicyResetRef = useRef<(() => void) | null>(null);
  const zombieResetRef = useRef<(() => void) | null>(null);
  const resetSpeakingUsersRef = useRef<(() => void) | null>(null);

  // ─── Sub-hook composition (topological order) ─────────────────────────────
  // 1. Telemetry — no deps.
  const tel = useLiveKitTelemetry({ activeWorkspace, session, livekitRoomNameRef });

  // 2. RemoteTracks — uses telemetry + permitirMediaParticipante; populates
  //    the subscribed/unsubscribed handler refs read by Lifecycle.
  const remoteTracks = useLiveKitRemoteTracks({
    permitirMediaParticipante,
    logRemoteMediaLifecycle: tel.logRemoteMediaLifecycle,
    onRemoteTrackSubscribedOutRef: onRemoteTrackSubscribedRef,
    onRemoteTrackUnsubscribedOutRef: onRemoteTrackUnsubscribedRef,
  });

  // 3. Lifecycle — owns Coordinator + room/participant state; reads sibling
  //    callback refs lazily inside conectarLivekit (event-time, not init-time).
  //    Speaker / Zombie reset are read via late-binding refs below.
  const lifecycle = useLiveKitRoomLifecycle({
    activeWorkspace, session, currentUser, onlineUsers,
    livekitRoomNameRef,
    onRemoteTrackSubscribedRef,
    onRemoteTrackUnsubscribedRef,
    onSpeakerChangeRef,
    onConnectionQualityChangedRef,
    cleanupParticipantTracks: remoteTracks.cleanupParticipantTracks,
    cleanupStaleParticipants: remoteTracks.cleanupStaleParticipants,
    resetAllRemoteTracksState: remoteTracks.resetAllRemoteTracksState,
    resetSpeakingUsersRef,
    zombieResetRef,
    subscriptionPolicyResetRef,
    realtimePositionsRef,
    recordTelemetry: tel.recordTelemetry,
    logRemoteMediaLifecycle: tel.logRemoteMediaLifecycle,
  });

  // 4. SpeakerDetection — uses Lifecycle's coordinator ref; populates
  //    onSpeakerChangeRef so Coordinator's onSpeakerChange (set up at
  //    construction time) routes events to setSpeakingUsers.
  const speaker = useLiveKitSpeakerDetection({
    realtimeCoordinatorRef: lifecycle.realtimeCoordinatorRef,
    onSpeakerChangeOutRef: onSpeakerChangeRef,
    resetSpeakingUsersOutRef: resetSpeakingUsersRef,
  });

  // 5. ZombieCleanup — uses Lifecycle's setRemoteParticipantIds + RemoteTracks
  //    map setters; populates onConnectionQualityChangedRef + zombieResetRef.
  useLiveKitZombieCleanup({
    setRemoteParticipantIds: lifecycle.setRemoteParticipantIds,
    setRemoteStreams: remoteTracks.setRemoteStreams,
    setRemoteScreenStreams: remoteTracks.setRemoteScreenStreams,
    setRemoteAudioTracks: remoteTracks.setRemoteAudioTracks,
    recordTelemetry: tel.recordTelemetry,
    onConnectionQualityChangedOutRef: onConnectionQualityChangedRef,
    resetZombieTimersOutRef: zombieResetRef,
  });

  // 6. RemoteSubscriptions — uses Lifecycle's room/connected state +
  //    Speaker's speakingUsersRef; populates subscriptionPolicyResetRef.
  useLiveKitRemoteSubscriptions({
    livekitRoomRef: lifecycle.livekitRoomRef,
    livekitConnected: lifecycle.livekitConnected,
    session,
    usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto,
    performanceSettings,
    speakingUsersRef: speaker.speakingUsersRef,
    recordTelemetry: tel.recordTelemetry,
    subscriptionPolicyResetOutRef: subscriptionPolicyResetRef,
  });

  // 7. LocalPublishing — uses Lifecycle's coordinator/room/state.
  const publishing = useLiveKitLocalPublishing({
    realtimeCoordinatorRef: lifecycle.realtimeCoordinatorRef,
    livekitRoomRef: lifecycle.livekitRoomRef,
    livekitConnected: lifecycle.livekitConnected,
    realtimeCoordinatorState: lifecycle.realtimeCoordinatorState,
    isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled,
    activeStreamRef, activeScreenRef,
    hasActiveCall, usersInAudioRange,
    stream, screenStream,
  });

  // 8. DataChannel — uses Lifecycle's coordinator ref.
  const data = useLiveKitDataChannel({ realtimeCoordinatorRef: lifecycle.realtimeCoordinatorRef });

  return {
    realtimeTransportMode: 'livekit',
    livekitRoomRef: lifecycle.livekitRoomRef,
    realtimeCoordinatorRef: lifecycle.realtimeCoordinatorRef,
    realtimeEventBusRef: lifecycle.realtimeEventBusRef,
    realtimeCoordinatorState: lifecycle.realtimeCoordinatorState,
    livekitConnected: lifecycle.livekitConnected,
    remoteStreams: remoteTracks.remoteStreams,
    remoteScreenStreams: remoteTracks.remoteScreenStreams,
    remoteAudioTracks: remoteTracks.remoteAudioTracks,
    remoteParticipantIds: lifecycle.remoteParticipantIds,
    speakingUsers: speaker.speakingUsers,
    setSpeakingUsers: speaker.setSpeakingUsers,
    publicarTrackLocal: publishing.publicarTrackLocal,
    despublicarTrackLocal: publishing.despublicarTrackLocal,
    sincronizarTracksLocales: publishing.sincronizarTracksLocales,
    conectarLivekit: lifecycle.conectarLivekit,
    limpiarLivekit: lifecycle.limpiarLivekit,
    enviarDataLivekit: data.enviarDataLivekit,
    permitirMediaParticipante,
    getPublishedVideoTrack: publishing.getPublishedVideoTrack,
  };
}
