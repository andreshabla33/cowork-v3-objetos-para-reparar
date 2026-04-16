/**
 * @module hooks/space3d/useLiveKit
 * Hook para gestión completa de LiveKit: conexión, publicación/despublicación
 * de tracks, suscripción selectiva por proximidad, speaker detection, audio espacial.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LocalTrack, Room, RoomEvent, Track, VideoQuality,
  RemoteTrackPublication,
} from 'livekit-client';
import type { User } from '@/types';
import { crearSalaLivekitPorEspacio, obtenerTokenLivekitEspacio } from '@/lib/livekitService';
import type { DataPacketContract } from '@/modules/realtime-room';
import type { SpaceMediaCoordinatorState } from '@/modules/realtime-room';
import type { SpaceRealtimeCoordinatorState } from '@/modules/realtime-room';
import { RealtimeEventBus, RealtimeSessionTelemetry, RemoteMediaLifecycleDiagnostics, RemoteRenderLifecyclePolicy, RemoteTrackAttachmentPolicy, SpaceRealtimeCoordinator, SubscriptionPolicyService, TrackPublicationCoordinator } from '@/modules/realtime-room';
import { type UseLiveKitReturn } from './types';

export function useLiveKit(params: {
  activeWorkspace: any;
  session: any;
  currentUser: User;
  empresasAutorizadas: string[];
  onlineUsers: User[];
  activeStreamRef: React.MutableRefObject<MediaStream | null>;
  activeScreenRef: React.MutableRefObject<MediaStream | null>;
  effectiveStreamRef: React.MutableRefObject<MediaStream | null>;
  desiredMediaState: { isMicrophoneEnabled: boolean; isCameraEnabled: boolean; isScreenShareEnabled: boolean };
  mediaCoordinatorState: SpaceMediaCoordinatorState | null;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  processedStream: MediaStream | null;
  cameraSettings: { backgroundEffect: string };
  performanceSettings?: { graphicsQuality?: string; batterySaver?: boolean };
  hasActiveCall: boolean;
  usersInCall: User[];
  usersInAudioRange: User[];
  conversacionesBloqueadasRemoto: Map<string, string[]>;
}): UseLiveKitReturn {
  const {
    activeWorkspace, session, currentUser, empresasAutorizadas, onlineUsers,
    activeStreamRef, activeScreenRef, effectiveStreamRef,
    desiredMediaState,
    mediaCoordinatorState,
    stream, screenStream, processedStream, cameraSettings,
    performanceSettings,
    hasActiveCall, usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto,
  } = params;

  const isMicrophoneEnabled = mediaCoordinatorState?.desiredMicrophoneEnabled ?? mediaCoordinatorState?.isMicrophoneEnabled ?? desiredMediaState.isMicrophoneEnabled;
  const isCameraEnabled = mediaCoordinatorState?.desiredCameraEnabled ?? mediaCoordinatorState?.isCameraEnabled ?? desiredMediaState.isCameraEnabled;
  const isScreenShareEnabled = mediaCoordinatorState?.desiredScreenShareEnabled ?? mediaCoordinatorState?.screenShareSession.active ?? desiredMediaState.isScreenShareEnabled;

  // ========== State ==========
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteAudioTracks, setRemoteAudioTracks] = useState<Map<string, MediaStreamTrack>>(new Map());
  const [livekitConnected, setLivekitConnected] = useState(false);
  const [realtimeCoordinatorState, setRealtimeCoordinatorState] = useState<SpaceRealtimeCoordinatorState | null>(null);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());

  // ========== Refs ==========
  const livekitRoomRef = useRef<Room | null>(null);
  const livekitRoomNameRef = useRef<string | null>(null);
  const livekitConnectingRef = useRef(false);
  const realtimeCoordinatorRef = useRef<SpaceRealtimeCoordinator | null>(null);
  const realtimeEventBusRef = useRef<RealtimeEventBus | null>(null);
  const telemetry = useMemo(() => new RealtimeSessionTelemetry({
    enabled: import.meta.env.DEV,
    scope: 'Space3DRealtime',
    sessionKey: `space3d:${activeWorkspace?.id ?? 'no-workspace'}:${session?.user?.id ?? 'anon'}`,
  }), [activeWorkspace?.id, session?.user?.id]);
  const remoteMediaDiagnosticsRef = useRef(new RemoteMediaLifecycleDiagnostics({ enabled: import.meta.env.DEV, scope: 'RemoteMediaLifecycle' }));
  const remoteRenderLifecyclePolicyRef = useRef(new RemoteRenderLifecyclePolicy());
  const remoteTrackAttachmentPolicyRef = useRef(new RemoteTrackAttachmentPolicy());
  const subscriptionPolicyServiceRef = useRef(new SubscriptionPolicyService());
  const trackPublicationCoordinatorRef = useRef(new TrackPublicationCoordinator());
  const subscriptionPolicySnapshotRef = useRef<ReturnType<SubscriptionPolicyService['buildSnapshot']> | null>(null);
  const appliedRemotePublicationStateRef = useRef<Map<string, { enabled: boolean | null; quality: VideoQuality | null; subscribed: boolean | null }>>(new Map());
  const lastPolicySummaryRef = useRef<string>('');
  const remoteAttachedTrackIdsRef = useRef({
    camera: new Map<string, string>(),
    screen_share: new Map<string, string>(),
    audio: new Map<string, string>(),
  });
  const remoteRenderedTrackIdsRef = useRef({
    camera: new Map<string, string>(),
    screen_share: new Map<string, string>(),
  });
  const remoteVideoTrackListenerCleanupRef = useRef<Map<string, () => void>>(new Map());
  const speakingUsersRef = useRef<Set<string>>(new Set());
  speakingUsersRef.current = speakingUsers;

  const mapVideoQuality = useCallback((quality: 'high' | 'medium' | 'low') => {
    if (quality === 'low') return VideoQuality.LOW;
    if (quality === 'medium') return VideoQuality.MEDIUM;
    return VideoQuality.HIGH;
  }, []);

  const clampPreferredVideoQuality = useCallback((quality: 'high' | 'medium' | 'low' | null) => {
    if (!quality) return null;
    const graphicsQuality = performanceSettings?.graphicsQuality ?? 'auto';
    const batterySaverEnabled = Boolean(performanceSettings?.batterySaver);
    if (batterySaverEnabled || graphicsQuality === 'low') {
      return quality === 'high' ? 'medium' : 'low';
    }
    if (graphicsQuality === 'medium' && quality === 'high') {
      return 'medium';
    }
    return quality;
  }, [performanceSettings?.batterySaver, performanceSettings?.graphicsQuality]);

  const recordRealtimeTelemetry = useCallback((name: string, data: Record<string, unknown> = {}, severity: 'info' | 'warn' | 'error' = 'info', category: 'remote_media' | 'subscription_policy' | 'meeting_access' | 'meeting_realtime' | 'meeting_quality' | 'space_realtime' = 'space_realtime') => {
    telemetry.record({
      category,
      name,
      severity,
      data,
    });
  }, [telemetry]);

  const logRemoteMediaLifecycle = useCallback((event: Parameters<RemoteMediaLifecycleDiagnostics['log']>[0], payload: Record<string, unknown> = {}) => {
    const enrichedPayload = {
      roomName: livekitRoomNameRef.current,
      ...payload,
    };
    remoteMediaDiagnosticsRef.current.log(event, {
      ...enrichedPayload,
    });
    recordRealtimeTelemetry(event, enrichedPayload, 'info', 'remote_media');
  }, [recordRealtimeTelemetry]);

  const getAttachedRemoteTrackId = useCallback((slot: 'camera' | 'screen_share' | 'audio', participantId: string): string | null => {
    return remoteAttachedTrackIdsRef.current[slot].get(participantId) ?? null;
  }, []);

  const setAttachedRemoteTrackId = useCallback((slot: 'camera' | 'screen_share' | 'audio', participantId: string, trackId: string | null) => {
    if (!trackId) {
      remoteAttachedTrackIdsRef.current[slot].delete(participantId);
      return;
    }
    remoteAttachedTrackIdsRef.current[slot].set(participantId, trackId);
  }, []);

  const getRenderedRemoteTrackId = useCallback((slot: 'camera' | 'screen_share', participantId: string): string | null => {
    return remoteRenderedTrackIdsRef.current[slot].get(participantId) ?? null;
  }, []);

  const setRenderedRemoteTrackId = useCallback((slot: 'camera' | 'screen_share', participantId: string, trackId: string | null) => {
    if (!trackId) {
      remoteRenderedTrackIdsRef.current[slot].delete(participantId);
      return;
    }
    remoteRenderedTrackIdsRef.current[slot].set(participantId, trackId);
  }, []);

  const clearRemoteVideoTrackListener = useCallback((listenerKey: string) => {
    const cleanup = remoteVideoTrackListenerCleanupRef.current.get(listenerKey);
    if (!cleanup) return;
    cleanup();
    remoteVideoTrackListenerCleanupRef.current.delete(listenerKey);
    const [participantId, slot, trackId] = listenerKey.split(':');
    logRemoteMediaLifecycle('video_lifecycle_listener_unbound', { participantId, slot, trackId });
  }, [logRemoteMediaLifecycle]);

  const clearRemoteVideoTrackListenersForParticipant = useCallback((participantId: string) => {
    Array.from(remoteVideoTrackListenerCleanupRef.current.keys())
      .filter((listenerKey) => listenerKey.startsWith(`${participantId}:`))
      .forEach((listenerKey) => {
        clearRemoteVideoTrackListener(listenerKey);
      });
  }, [clearRemoteVideoTrackListener]);

  const applyRemoteRenderedVideoState = useCallback((participantId: string, slot: 'camera' | 'screen_share', track: MediaStreamTrack, trigger: 'subscribed' | 'mute' | 'unmute' | 'ended' | 'rebind') => {
    const currentAttachedTrackId = getAttachedRemoteTrackId(slot, participantId);
    const currentRenderedTrackId = getRenderedRemoteTrackId(slot, participantId);
    const isRenderReady = remoteRenderLifecyclePolicyRef.current.isTrackRenderReady(track);
    const decision = remoteRenderLifecyclePolicyRef.current.onTrackCandidate({
      participantId,
      slot,
      trackId: track.id,
      currentAttachedTrackId,
      currentRenderedTrackId,
      isRenderReady,
    });

    if (decision.action === 'noop') {
      return;
    }

    const setter = slot === 'screen_share' ? setRemoteScreenStreams : setRemoteStreams;

    if (decision.action === 'expose') {
      setter((prev) => {
        const next = new Map(prev);
        next.set(participantId, new MediaStream([track]));
        return next;
      });
      setRenderedRemoteTrackId(slot, participantId, track.id);
      logRemoteMediaLifecycle('video_render_exposed', {
        participantId,
        slot,
        trackId: track.id,
        trigger,
        currentAttachedTrackId,
        currentRenderedTrackId,
        readyState: track.readyState,
        muted: track.muted,
      });
      return;
    }

    setter((prev) => {
      const next = new Map(prev);
      next.delete(participantId);
      return next;
    });
    setRenderedRemoteTrackId(slot, participantId, null);
    logRemoteMediaLifecycle('video_render_hidden', {
      participantId,
      slot,
      trackId: track.id,
      trigger,
      currentAttachedTrackId,
      currentRenderedTrackId,
      readyState: track.readyState,
      muted: track.muted,
      isRenderReady,
    });
  }, [getAttachedRemoteTrackId, getRenderedRemoteTrackId, setRenderedRemoteTrackId, logRemoteMediaLifecycle]);

  const bindRemoteVideoTrackLifecycle = useCallback((participantId: string, slot: 'camera' | 'screen_share', track: MediaStreamTrack) => {
    const listenerKey = `${participantId}:${slot}:${track.id}`;
    if (remoteVideoTrackListenerCleanupRef.current.has(listenerKey)) {
      applyRemoteRenderedVideoState(participantId, slot, track, 'rebind');
      return;
    }

    const handleTrackMuted = () => {
      logRemoteMediaLifecycle('video_lifecycle_signal', { participantId, slot, trackId: track.id, signal: 'mute', readyState: track.readyState, muted: track.muted });
      applyRemoteRenderedVideoState(participantId, slot, track, 'mute');
    };

    const handleTrackUnmuted = () => {
      logRemoteMediaLifecycle('video_lifecycle_signal', { participantId, slot, trackId: track.id, signal: 'unmute', readyState: track.readyState, muted: track.muted });
      applyRemoteRenderedVideoState(participantId, slot, track, 'unmute');
    };

    const handleTrackEnded = () => {
      logRemoteMediaLifecycle('video_lifecycle_signal', { participantId, slot, trackId: track.id, signal: 'ended', readyState: track.readyState, muted: track.muted });
      applyRemoteRenderedVideoState(participantId, slot, track, 'ended');
    };

    track.addEventListener('mute', handleTrackMuted);
    track.addEventListener('unmute', handleTrackUnmuted);
    track.addEventListener('ended', handleTrackEnded);

    remoteVideoTrackListenerCleanupRef.current.set(listenerKey, () => {
      track.removeEventListener('mute', handleTrackMuted);
      track.removeEventListener('unmute', handleTrackUnmuted);
      track.removeEventListener('ended', handleTrackEnded);
    });

    logRemoteMediaLifecycle('video_lifecycle_listener_bound', { participantId, slot, trackId: track.id, readyState: track.readyState, muted: track.muted });
    applyRemoteRenderedVideoState(participantId, slot, track, 'subscribed');
  }, [applyRemoteRenderedVideoState, logRemoteMediaLifecycle]);

  // ========== Helpers ==========
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

  // ========== Track management ==========
  const despublicarTrackLocal = useCallback(async (tipo: 'audio' | 'video' | 'screen') => {
    const coordinator = realtimeCoordinatorRef.current;
    if (!coordinator) return;
    const source = tipo === 'audio' ? 'microphone' : tipo === 'video' ? 'camera' : 'screen_share';
    try {
      await coordinator.unpublishTracksBySource(source);
    } catch (e) {
      console.warn('Error despublicando track LiveKit:', e);
    }
  }, []);

  const getPublishedTrackIdBySource = useCallback((source: 'camera' | 'microphone' | 'screen_share'): string | null => {
    const publication = realtimeCoordinatorRef.current?.getLocalTrackPublicationBySource(source);
    const localTrack = publication?.track as (LocalTrack & { mediaStreamTrack?: MediaStreamTrack }) | undefined;
    return localTrack?.mediaStreamTrack?.id ?? null;
  }, []);

  const publicarTrackLocal = useCallback(async (track: MediaStreamTrack, tipo: 'audio' | 'video' | 'screen') => {
    const coordinator = realtimeCoordinatorRef.current;
    const room = livekitRoomRef.current;
    if (!coordinator || !room || room.state !== 'connected') return;
    const source = tipo === 'audio' ? 'microphone' : tipo === 'video' ? 'camera' : 'screen_share';
    const replaced = await coordinator.replaceTrackBySource(source, track);
    if (!replaced) {
      throw new Error(`No se pudo publicar/reemplazar track ${tipo}`);
    }
    console.log(`[LIVEKIT] Track ${tipo} publicado`);
  }, []);

  const sincronizarTracksLocales = useCallback(async () => {
    const room = livekitRoomRef.current;
    if (!room || room.state !== 'connected') return;

    const streamActual = activeStreamRef.current;
    const audioTrack = streamActual?.getAudioTracks()[0] ?? null;
    let cameraTrack = effectiveStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') ?? null;
    if (!cameraTrack) {
      cameraTrack = streamActual?.getVideoTracks().find((t) => t.readyState === 'live') ?? null;
    }
    const screenTrack = activeScreenRef.current?.getVideoTracks()[0] ?? null;

    const syncPlan = trackPublicationCoordinatorRef.current.buildSyncPlan({
      desiredMicrophoneEnabled: isMicrophoneEnabled,
      desiredCameraEnabled: isCameraEnabled,
      desiredScreenShareEnabled: isScreenShareEnabled,
      microphoneTrack: audioTrack,
      cameraTrack,
      screenShareTrack: screenTrack,
      publishedTrackIds: {
        microphone: getPublishedTrackIdBySource('microphone'),
        camera: getPublishedTrackIdBySource('camera'),
        screen_share: getPublishedTrackIdBySource('screen_share'),
      },
    });

    for (const item of syncPlan.items) {
      if (item.action === 'publish_or_replace' && item.track) {
        const tipo = item.source === 'microphone' ? 'audio' : item.source === 'camera' ? 'video' : 'screen';
        await publicarTrackLocal(item.track, tipo);
      } else if (item.action === 'unpublish') {
        const tipo = item.source === 'microphone' ? 'audio' : item.source === 'camera' ? 'video' : 'screen';
        await despublicarTrackLocal(tipo);
      }

      if (item.track && item.targetTrackEnabled !== undefined) {
        item.track.enabled = item.targetTrackEnabled;
      }
    }
  }, [isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, getPublishedTrackIdBySource, publicarTrackLocal, despublicarTrackLocal]);

  // ========== Cleanup ==========
  const limpiarLivekit = useCallback(async () => {
    const room = livekitRoomRef.current;
    if (room) {
      room.removeAllListeners();
    }
    realtimeCoordinatorRef.current?.disconnect();
    realtimeCoordinatorRef.current = null;
    realtimeEventBusRef.current = null;
    Array.from(remoteVideoTrackListenerCleanupRef.current.keys()).forEach((listenerKey) => {
      try {
        clearRemoteVideoTrackListener(listenerKey);
      } catch (e) {
        console.warn('Error clearing video track listener:', listenerKey, e);
      }
    });
    remoteVideoTrackListenerCleanupRef.current.clear();  // ← Ensure ref is emptied
    logRemoteMediaLifecycle('remote_cleanup', {
      attachedCameraCount: remoteAttachedTrackIdsRef.current.camera.size,
      attachedScreenShareCount: remoteAttachedTrackIdsRef.current.screen_share.size,
      attachedAudioCount: remoteAttachedTrackIdsRef.current.audio.size,
      renderedCameraCount: remoteRenderedTrackIdsRef.current.camera.size,
      renderedScreenShareCount: remoteRenderedTrackIdsRef.current.screen_share.size,
    });
    remoteAttachedTrackIdsRef.current.camera.clear();
    remoteAttachedTrackIdsRef.current.screen_share.clear();
    remoteAttachedTrackIdsRef.current.audio.clear();
    remoteRenderedTrackIdsRef.current.camera.clear();
    remoteRenderedTrackIdsRef.current.screen_share.clear();
    livekitRoomRef.current = null;
    livekitRoomNameRef.current = null;
    setLivekitConnected(false);
    setRealtimeCoordinatorState(null);
    setRemoteStreams(new Map());
    setRemoteScreenStreams(new Map());
    setRemoteAudioTracks(new Map());
    setSpeakingUsers(new Set());
  }, []);

  // ========== Connect ==========
  const conectarLivekit = useCallback(async (roomName: string) => {
    if (!activeWorkspace?.id || !session?.access_token) return;
    if (livekitRoomNameRef.current === roomName) return;
    if (livekitConnectingRef.current) return;

    try {
      livekitConnectingRef.current = true;
      await limpiarLivekit();

      const tokenData = await obtenerTokenLivekitEspacio({
        roomName, espacioId: activeWorkspace.id,
        accessToken: session.access_token,
        empresaId: currentUser.empresa_id,
        departamentoId: currentUser.departamento_id,
      });

      const coordinator = new SpaceRealtimeCoordinator({
        serverUrl: tokenData.url,
        token: tokenData.token,
        onConnectionChange: (connected) => {
          setLivekitConnected(connected);
          if (!connected) {
            livekitRoomNameRef.current = null;
            livekitRoomRef.current = null;
          }
        },
        onStateChange: setRealtimeCoordinatorState,
        onRemoteTrackSubscribed: (track, _pub, participant) => {
          if (!participant || !track) return;
          const slot = track.kind === Track.Kind.Video
            ? (track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera')
            : 'audio';
          logRemoteMediaLifecycle('track_subscribed', {
            participantId: participant.identity,
            slot,
            kind: track.kind,
            trackId: track.mediaStreamTrack?.id,
            source: track.source,
          });
          if (!permitirMediaParticipante(participant.metadata)) {
            logRemoteMediaLifecycle('track_subscription_skipped', {
              participantId: participant.identity,
              slot,
              kind: track.kind,
              trackId: track.mediaStreamTrack?.id,
              reason: 'participant_media_not_allowed',
            });
            return;
          }
          if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
            const slot = track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera';
            const decision = remoteTrackAttachmentPolicyRef.current.onTrackSubscribed({
              participantId: participant.identity,
              slot,
              trackId: track.mediaStreamTrack.id,
              currentTrackId: getAttachedRemoteTrackId(slot, participant.identity),
            });
            if (decision.action !== 'attach') {
              logRemoteMediaLifecycle('track_subscription_skipped', {
                participantId: participant.identity,
                slot,
                kind: track.kind,
                trackId: track.mediaStreamTrack.id,
                reason: 'attachment_policy_noop',
                currentAttachedTrackId: getAttachedRemoteTrackId(slot, participant.identity),
              });
              return;
            }
            setAttachedRemoteTrackId(slot, participant.identity, track.mediaStreamTrack.id);
            logRemoteMediaLifecycle('track_attached', {
              participantId: participant.identity,
              slot,
              kind: track.kind,
              trackId: track.mediaStreamTrack.id,
            });
            bindRemoteVideoTrackLifecycle(participant.identity, slot, track.mediaStreamTrack);
          }
          if (track.kind === Track.Kind.Audio && track.mediaStreamTrack) {
            const decision = remoteTrackAttachmentPolicyRef.current.onTrackSubscribed({
              participantId: participant.identity,
              slot: 'audio',
              trackId: track.mediaStreamTrack.id,
              currentTrackId: getAttachedRemoteTrackId('audio', participant.identity),
            });
            if (decision.action !== 'attach') {
              logRemoteMediaLifecycle('track_subscription_skipped', {
                participantId: participant.identity,
                slot: 'audio',
                kind: track.kind,
                trackId: track.mediaStreamTrack.id,
                reason: 'attachment_policy_noop',
                currentAttachedTrackId: getAttachedRemoteTrackId('audio', participant.identity),
              });
              return;
            }
            setRemoteAudioTracks(prev => new Map(prev).set(participant.identity, track.mediaStreamTrack));
            setAttachedRemoteTrackId('audio', participant.identity, track.mediaStreamTrack.id);
            logRemoteMediaLifecycle('track_attached', {
              participantId: participant.identity,
              slot: 'audio',
              kind: track.kind,
              trackId: track.mediaStreamTrack.id,
            });
          }
        },
        onRemoteTrackUnsubscribed: (track, _pub, participant) => {
          if (!participant || !track) return;
          const slot = track.kind === Track.Kind.Video
            ? (track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera')
            : 'audio';
          logRemoteMediaLifecycle('track_unsubscribed', {
            participantId: participant.identity,
            slot,
            kind: track.kind,
            trackId: track.mediaStreamTrack?.id,
            source: track.source,
          });
          if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
            const slot = track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera';
            clearRemoteVideoTrackListener(`${participant.identity}:${slot}:${track.mediaStreamTrack.id}`);
            const decision = remoteTrackAttachmentPolicyRef.current.onTrackUnsubscribed({
              participantId: participant.identity,
              slot,
              trackId: track.mediaStreamTrack.id,
              currentTrackId: getAttachedRemoteTrackId(slot, participant.identity),
            });
            if (decision.action !== 'detach') {
              logRemoteMediaLifecycle('track_detach_skipped', {
                participantId: participant.identity,
                slot,
                kind: track.kind,
                trackId: track.mediaStreamTrack.id,
                reason: 'stale_track_or_already_detached',
                currentAttachedTrackId: getAttachedRemoteTrackId(slot, participant.identity),
              });
              return;
            }
            const renderDecision = remoteRenderLifecyclePolicyRef.current.onTrackUnsubscribed({
              participantId: participant.identity,
              slot,
              trackId: track.mediaStreamTrack.id,
              currentRenderedTrackId: getRenderedRemoteTrackId(slot, participant.identity),
            });
            if (renderDecision.action === 'hide') {
              const setter = track.source === Track.Source.ScreenShare ? setRemoteScreenStreams : setRemoteStreams;
              setter(prev => {
                const next = new Map(prev);
                next.delete(participant.identity);
                return next;
              });
              setRenderedRemoteTrackId(slot, participant.identity, null);
            }
            setAttachedRemoteTrackId(slot, participant.identity, null);
            logRemoteMediaLifecycle('track_detached', {
              participantId: participant.identity,
              slot,
              kind: track.kind,
              trackId: track.mediaStreamTrack.id,
            });
          }
          if (track.kind === Track.Kind.Audio && track.mediaStreamTrack) {
            const decision = remoteTrackAttachmentPolicyRef.current.onTrackUnsubscribed({
              participantId: participant.identity,
              slot: 'audio',
              trackId: track.mediaStreamTrack.id,
              currentTrackId: getAttachedRemoteTrackId('audio', participant.identity),
            });
            if (decision.action !== 'detach') {
              logRemoteMediaLifecycle('track_detach_skipped', {
                participantId: participant.identity,
                slot: 'audio',
                kind: track.kind,
                trackId: track.mediaStreamTrack.id,
                reason: 'stale_track_or_already_detached',
                currentAttachedTrackId: getAttachedRemoteTrackId('audio', participant.identity),
              });
              return;
            }
            setRemoteAudioTracks(prev => {
              const next = new Map(prev);
              next.delete(participant.identity);
              return next;
            });
            setAttachedRemoteTrackId('audio', participant.identity, null);
            logRemoteMediaLifecycle('track_detached', {
              participantId: participant.identity,
              slot: 'audio',
              kind: track.kind,
              trackId: track.mediaStreamTrack.id,
            });
          }
        },
        onParticipantDisconnected: (participant) => {
          logRemoteMediaLifecycle('participant_disconnected', {
            participantId: participant.identity,
            attachedCameraTrackId: getAttachedRemoteTrackId('camera', participant.identity),
            attachedScreenShareTrackId: getAttachedRemoteTrackId('screen_share', participant.identity),
            attachedAudioTrackId: getAttachedRemoteTrackId('audio', participant.identity),
            renderedCameraTrackId: getRenderedRemoteTrackId('camera', participant.identity),
            renderedScreenShareTrackId: getRenderedRemoteTrackId('screen_share', participant.identity),
          });
          clearRemoteVideoTrackListenersForParticipant(participant.identity);
          remoteTrackAttachmentPolicyRef.current.buildParticipantDetachPlan(remoteAttachedTrackIdsRef.current, participant.identity).forEach((decision) => {
            setAttachedRemoteTrackId(decision.slot, decision.participantId, null);
          });
          remoteRenderLifecyclePolicyRef.current.buildParticipantHidePlan(remoteRenderedTrackIdsRef.current, participant.identity).forEach((decision) => {
            setRenderedRemoteTrackId(decision.slot, decision.participantId, null);
          });
          setRemoteStreams(prev => { const n = new Map(prev); n.delete(participant.identity); return n; });
          setRemoteScreenStreams(prev => { const n = new Map(prev); n.delete(participant.identity); return n; });
          setRemoteAudioTracks(prev => { const n = new Map(prev); n.delete(participant.identity); return n; });
        },
        onSpeakerChange: (speakerIds) => {
          const active = new Set(speakerIds);
          const room = coordinator.getRoom();
          if (room?.localParticipant.isSpeaking) active.add(room.localParticipant.identity);
          setSpeakingUsers(active);
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
      console.log(`[LIVEKIT] Connected to room ${roomName} (${room.remoteParticipants.size} participants)`);
      recordRealtimeTelemetry('livekit_connected', {
        roomName,
        remoteParticipants: room.remoteParticipants.size,
      });
    } catch (err: any) {
      console.error('[LIVEKIT] Connection failed:', err.message);
      recordRealtimeTelemetry('livekit_connection_failed', {
        roomName,
        message: err?.message ?? 'unknown',
      }, 'error');
      livekitRoomNameRef.current = null; livekitRoomRef.current = null;
      realtimeCoordinatorRef.current = null;
      realtimeEventBusRef.current = null;
      setLivekitConnected(false);
      setRealtimeCoordinatorState(null);
    } finally {
      livekitConnectingRef.current = false;
    }
  }, [activeWorkspace?.id, session?.access_token, currentUser.empresa_id, currentUser.departamento_id, limpiarLivekit, permitirMediaParticipante, getAttachedRemoteTrackId, setAttachedRemoteTrackId, bindRemoteVideoTrackLifecycle, clearRemoteVideoTrackListener, getRenderedRemoteTrackId, setRenderedRemoteTrackId, clearRemoteVideoTrackListenersForParticipant, logRemoteMediaLifecycle]);

  // ========== Auto-connect/disconnect ==========
  const hayOtrosUsuariosOnline = onlineUsers.length > 0;
  const hayOtrosUsuariosRef = useRef(hayOtrosUsuariosOnline);
  hayOtrosUsuariosRef.current = hayOtrosUsuariosOnline;

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    if (hayOtrosUsuariosOnline) {
      const roomName = crearSalaLivekitPorEspacio(activeWorkspace.id);
      conectarLivekit(roomName).catch(console.error);
    } else {
      const timer = setTimeout(() => {
        if (!hayOtrosUsuariosRef.current && livekitRoomRef.current) {
          limpiarLivekit().catch(() => {});
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeWorkspace?.id, hayOtrosUsuariosOnline, conectarLivekit, limpiarLivekit]);

  useEffect(() => {
    return () => { limpiarLivekit().catch(() => {}); };
  }, [limpiarLivekit]);

  // ========== Sincronizar tracks por cambio de mic/cam/screen ==========
  const hasAnyoneNearbyForSync = hasActiveCall || usersInAudioRange.length > 0;
  useEffect(() => {
    if (!livekitConnected || !hasAnyoneNearbyForSync) return;
    sincronizarTracksLocales().catch(console.warn);
  }, [livekitConnected, hasAnyoneNearbyForSync, hasActiveCall, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, stream, screenStream, sincronizarTracksLocales]);

  // ========== Suscripción selectiva (3-tier) ==========
  const livekitSubscribedIdsRef = useRef<Set<string>>(new Set());
  const livekitAudioOnlyIdsRef = useRef<Set<string>>(new Set());
  const pendingUnsubscribeTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const livekitTransportSubscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!livekitConnected) return;
    const room = livekitRoomRef.current;
    if (!room) return;

    const idsEnProximidad = new Set(usersInCall.map((u) => u.id));
    const idsEnAudioRange = new Set(usersInAudioRange.map((u) => u.id));
    const idsTransportSuscritos = livekitTransportSubscribedRef.current;

    const policySnapshot = subscriptionPolicyServiceRef.current.buildSnapshot({
      currentUserId: session?.user?.id,
      participantIds: Array.from(room.remoteParticipants.keys()),
      usersInCallCount: usersInCall.length,
      directProximityIds: idsEnProximidad,
      audioRangeIds: idsEnAudioRange,
      speakingIds: speakingUsersRef.current,
      lockedConversations: conversacionesBloqueadasRemoto,
    });
    subscriptionPolicySnapshotRef.current = policySnapshot;
    const qualityCeiling = clampPreferredVideoQuality('high') ?? 'high';
    const policySummary = JSON.stringify({
      inRange: policySnapshot.inRangeParticipantIds.size,
      direct: policySnapshot.directParticipantIds.size,
      audioRange: policySnapshot.audioRangeParticipantIds.size,
      qualityCeiling,
      batterySaver: Boolean(performanceSettings?.batterySaver),
      graphicsQuality: performanceSettings?.graphicsQuality ?? 'auto',
    });
    if (lastPolicySummaryRef.current !== policySummary) {
      lastPolicySummaryRef.current = policySummary;
      recordRealtimeTelemetry('subscription_policy_applied', {
        inRangeParticipants: policySnapshot.inRangeParticipantIds.size,
        directParticipants: policySnapshot.directParticipantIds.size,
        audioRangeParticipants: policySnapshot.audioRangeParticipantIds.size,
        qualityCeiling,
        batterySaver: Boolean(performanceSettings?.batterySaver),
        graphicsQuality: performanceSettings?.graphicsQuality ?? 'auto',
      }, 'info', 'subscription_policy');
    }

    // SUBSCRIBE nuevos
    policySnapshot.inRangeParticipantIds.forEach((userId) => {
      const participant = room.getParticipantByIdentity(userId);
      if (!participant) return;
      const decision = policySnapshot.decisions.get(userId);
      if (!decision?.shouldSubscribe) return;

      const pendingTimer = pendingUnsubscribeTimersRef.current.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingUnsubscribeTimersRef.current.delete(userId);
      }

      // Clear cache entries for this user to force fresh state evaluation
      Array.from(appliedRemotePublicationStateRef.current.keys()).forEach((stateKey) => {
        if (stateKey.startsWith(userId + ':')) {
          appliedRemotePublicationStateRef.current.delete(stateKey);
        }
      });

      participant.trackPublications.forEach((pub) => {
        if (!(pub instanceof RemoteTrackPublication)) return;
        const stateKey = `${userId}:${pub.trackSid}`;
        const previousState = appliedRemotePublicationStateRef.current.get(stateKey) ?? { enabled: null, quality: null, subscribed: null };
        if (!pub.isSubscribed) {
          pub.setSubscribed(true);
          previousState.subscribed = true;
        }
        appliedRemotePublicationStateRef.current.set(stateKey, previousState);
      });
      participant.trackPublications.forEach((pub) => {
        if (pub instanceof RemoteTrackPublication && pub.isSubscribed) {
          const stateKey = `${userId}:${pub.trackSid}`;
          const previousState = appliedRemotePublicationStateRef.current.get(stateKey) ?? { enabled: null, quality: null, subscribed: null };
          if (pub.isEnabled !== decision.shouldEnable) {
            pub.setEnabled(decision.shouldEnable);
            previousState.enabled = decision.shouldEnable;
          }
          const effectivePreferredQuality = clampPreferredVideoQuality(decision.preferredVideoQuality);
          if (pub.kind === Track.Kind.Video && effectivePreferredQuality) {
            const mappedQuality = mapVideoQuality(effectivePreferredQuality);
            if (previousState.quality !== mappedQuality) {
              pub.setVideoQuality(mappedQuality);
              previousState.quality = mappedQuality;
            }
          }
          previousState.subscribed = true;
          appliedRemotePublicationStateRef.current.set(stateKey, previousState);
        }
      });
      idsTransportSuscritos.add(userId);
    });

    // DISABLE + deferred UNSUBSCRIBE fuera de rangos
    idsTransportSuscritos.forEach((userId) => {
      const decision = policySnapshot.decisions.get(userId);
      if (decision?.shouldSubscribe) return;
      const participant = room.getParticipantByIdentity(userId);
      if (participant) {
        participant.trackPublications.forEach((pub) => {
          if (pub instanceof RemoteTrackPublication && pub.isSubscribed && pub.isEnabled) {
            pub.setEnabled(false);
            const stateKey = `${userId}:${pub.trackSid}`;
            const previousState = appliedRemotePublicationStateRef.current.get(stateKey) ?? { enabled: null, quality: null, subscribed: null };
            previousState.enabled = false;
            previousState.subscribed = true;
            appliedRemotePublicationStateRef.current.set(stateKey, previousState);
            // Clear listener state for this track
            const listenerKey = `${userId}:${pub.trackSid}`;
            clearRemoteVideoTrackListener(listenerKey);
            remoteAttachedTrackIdsRef.current.camera.delete(userId);
            remoteAttachedTrackIdsRef.current.audio.delete(userId);
          }
        });
      }
      if (!pendingUnsubscribeTimersRef.current.has(userId)) {
        const timer = setTimeout(() => {
          pendingUnsubscribeTimersRef.current.delete(userId);
          if (livekitSubscribedIdsRef.current.has(userId) || livekitAudioOnlyIdsRef.current.has(userId)) {
            const p = room.getParticipantByIdentity(userId);
            if (p) p.trackPublications.forEach((pub) => {
              if (pub instanceof RemoteTrackPublication && pub.isSubscribed && !pub.isEnabled) pub.setEnabled(true);
            });
            return;
          }
          const p = room.getParticipantByIdentity(userId);
          if (p) p.trackPublications.forEach((pub) => {
            if (pub instanceof RemoteTrackPublication && pub.isSubscribed) {
              pub.setSubscribed(false);
              appliedRemotePublicationStateRef.current.delete(`${userId}:${pub.trackSid}`);
            }
          });
          idsTransportSuscritos.delete(userId);
          recordRealtimeTelemetry('subscription_policy_unsubscribed_deferred', {
            participantId: userId,
            deferMs: decision?.deferUnsubscribeMs ?? 5000,
          }, 'info', 'subscription_policy');
        }, decision?.deferUnsubscribeMs ?? 5000);
        pendingUnsubscribeTimersRef.current.set(userId, timer);
      }
    });

    livekitSubscribedIdsRef.current = policySnapshot.directParticipantIds;
    livekitAudioOnlyIdsRef.current = policySnapshot.audioRangeParticipantIds;
  }, [livekitConnected, usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto, session?.user?.id, mapVideoQuality, clampPreferredVideoQuality, performanceSettings?.batterySaver, performanceSettings?.graphicsQuality, recordRealtimeTelemetry]);

  // Suscribir tracks nuevos de participantes ya en rango
  useEffect(() => {
    if (!livekitConnected) return;
    const room = livekitRoomRef.current;
    if (!room) return;
    const handleTrackPublished = (publication: any, participant: any) => {
      if (!participant) return;
      if (!subscriptionPolicyServiceRef.current.shouldSubscribeOnTrackPublished(subscriptionPolicySnapshotRef.current, participant.identity)) {
        recordRealtimeTelemetry('track_published_subscription_skipped', {
          participantId: participant.identity,
          trackSid: publication?.trackSid,
        }, 'info', 'subscription_policy');
        return;
      }
      if (!publication.isSubscribed) {
        publication.setSubscribed(true);
        livekitTransportSubscribedRef.current.add(participant.identity);
        recordRealtimeTelemetry('track_published_subscription_enabled', {
          participantId: participant.identity,
          trackSid: publication?.trackSid,
        }, 'info', 'subscription_policy');
      }
    };
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    return () => { room.off(RoomEvent.TrackPublished, handleTrackPublished); };
  }, [livekitConnected]);

  // ========== Publish/unpublish por proximidad ==========
  const prevHasAnyoneNearbyRef = useRef(false);
  const prevHasActiveCallRef = useRef(false);
  const publishDelayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAnyoneNearby = hasActiveCall || usersInAudioRange.length > 0;

  useEffect(() => {
    if (!livekitConnected) return;
    const prevHasAnyoneNearby = prevHasAnyoneNearbyRef.current;
    const prevHasActiveCall = prevHasActiveCallRef.current;
    prevHasAnyoneNearbyRef.current = hasAnyoneNearby;
    prevHasActiveCallRef.current = hasActiveCall;

    if (!hasAnyoneNearby && prevHasAnyoneNearby) {
      if (publishDelayTimerRef.current) { clearTimeout(publishDelayTimerRef.current); publishDelayTimerRef.current = null; }
      ['audio', 'video', 'screen'].forEach(t => despublicarTrackLocal(t as any).catch(() => {}));
    } else if (!hasActiveCall && prevHasActiveCall && usersInAudioRange.length > 0) {
      if (publishDelayTimerRef.current) { clearTimeout(publishDelayTimerRef.current); publishDelayTimerRef.current = null; }
      // Unpublish screen only (audio is OK for audio-range users)
      // DO NOT clear remoteVideoTrackListenerCleanupRef here — clearing the Map
      // without invoking the cleanup functions leaves zombie track-event listeners
      // that can block subsequent publications from reaching the peer.
      despublicarTrackLocal('screen').catch(() => {});
    } else if (hasActiveCall && !prevHasActiveCall) {
      if (publishDelayTimerRef.current) clearTimeout(publishDelayTimerRef.current);
      publishDelayTimerRef.current = setTimeout(() => {
        publishDelayTimerRef.current = null;
        if (livekitRoomRef.current?.state === 'connected') sincronizarTracksLocales().catch(() => {});
      }, 500);
    } else if (hasAnyoneNearby && !prevHasAnyoneNearby && !hasActiveCall) {
      if (publishDelayTimerRef.current) clearTimeout(publishDelayTimerRef.current);
      publishDelayTimerRef.current = setTimeout(() => {
        publishDelayTimerRef.current = null;
        if (livekitRoomRef.current?.state === 'connected') sincronizarTracksLocales().catch(() => {});
      }, 500);
    }
    return () => { if (publishDelayTimerRef.current) { clearTimeout(publishDelayTimerRef.current); publishDelayTimerRef.current = null; } };
  }, [livekitConnected, hasActiveCall, hasAnyoneNearby, usersInAudioRange.length, despublicarTrackLocal, sincronizarTracksLocales, stream]);

  // ========== Re-publicar video al cambiar effectiveStream ==========
  const prevEffectiveStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!livekitConnected || !hasActiveCall || !isCameraEnabled) return;
    const room = livekitRoomRef.current;
    if (!room || room.state !== 'connected') return;
    const effectiveStream = effectiveStreamRef.current;
    if (effectiveStream === prevEffectiveStreamRef.current) return;
    if (cameraSettings.backgroundEffect !== 'none' && !processedStream) return;

    const debounce = setTimeout(async () => {
      const videoTrack = effectiveStream?.getVideoTracks().find(t => t.readyState === 'live');
      if (videoTrack) {
        try { await publicarTrackLocal(videoTrack, 'video'); prevEffectiveStreamRef.current = effectiveStream; }
        catch (e) { console.error('[LIVEKIT] Error re-publicando video:', e); }
      }
    }, 800);
    return () => clearTimeout(debounce);
  }, [livekitConnected, processedStream, hasActiveCall, isCameraEnabled, cameraSettings.backgroundEffect, publicarTrackLocal]);

  // ========== DataChannel send ==========
  const enviarDataLivekit = useCallback((mensaje: DataPacketContract, reliable = true) => {
    const coordinator = realtimeCoordinatorRef.current;
    if (!coordinator) return false;
    coordinator.publishData(mensaje, reliable).catch(console.warn);
    return true;
  }, []);

  return {
    realtimeTransportMode: 'livekit',
    livekitRoomRef,
    realtimeCoordinatorRef,
    realtimeEventBusRef,
    realtimeCoordinatorState,
    livekitConnected,
    remoteStreams,
    remoteScreenStreams,
    remoteAudioTracks,
    speakingUsers,
    setSpeakingUsers,
    publicarTrackLocal,
    despublicarTrackLocal,
    sincronizarTracksLocales,
    conectarLivekit,
    limpiarLivekit,
    enviarDataLivekit,
    permitirMediaParticipante,
  };
}
