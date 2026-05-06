/**
 * @module modules/realtime-room/presentation/useLiveKitLocalPublishing
 * @description Sub-hook of the P0-03 useLiveKit decomposition: owns the
 * local-track publishing pipeline. Resolves publish/replace/unpublish
 * decisions through TrackPublicationCoordinator (sync plan) and applies
 * them via SpaceRealtimeCoordinator's source-keyed publishing surface.
 * Also drives the proximity-based publish/unpublish effect (publishes
 * when there's an active call or someone in audio range; unpublishes
 * with debounce when alone) and exposes the published video track for
 * the camera-effects pipeline (`useLiveKitVideoBackground`).
 *
 * Single responsibility: local track publishing + proximity gating. Does
 * NOT touch device acquisition (that's `useMediaStream`) or remote
 * subscriptions (that's `useLiveKitRemoteSubscriptions`).
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs (livekit-client / docs.livekit.io):
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/LocalParticipant.html
 *     (publishTrack / unpublishTrack — surfaced through Coordinator)
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/LocalVideoTrack.html
 *     (consumed by useLiveKitVideoBackground for setProcessor / switchTo)
 */

import { useCallback, useEffect, useRef } from 'react';
import { LocalTrack, LocalVideoTrack, type Room } from 'livekit-client';
import type { User } from '@/types';
import { logger } from '@/lib/logger';
import {
  type SpaceRealtimeCoordinator,
  type SpaceRealtimeCoordinatorState,
  TrackPublicationCoordinator,
} from '@/modules/realtime-room';

const log = logger.child('useLiveKit-local-publishing');

export interface UseLiveKitLocalPublishingParams {
  realtimeCoordinatorRef: React.MutableRefObject<SpaceRealtimeCoordinator | null>;
  livekitRoomRef: React.MutableRefObject<Room | null>;
  livekitConnected: boolean;
  realtimeCoordinatorState: SpaceRealtimeCoordinatorState | null;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  activeStreamRef: React.MutableRefObject<MediaStream | null>;
  activeScreenRef: React.MutableRefObject<MediaStream | null>;
  hasActiveCall: boolean;
  usersInAudioRange: User[];
  stream: MediaStream | null;
  screenStream: MediaStream | null;
}

export interface UseLiveKitLocalPublishingReturn {
  publicarTrackLocal: (track: MediaStreamTrack, tipo: 'audio' | 'video' | 'screen') => Promise<void>;
  despublicarTrackLocal: (tipo: 'audio' | 'video' | 'screen', stopOnUnpublish?: boolean) => Promise<void>;
  sincronizarTracksLocales: () => Promise<void>;
  getPublishedVideoTrack: () => LocalVideoTrack | null;
}

const PROXIMITY_PUBLISH_DELAY_MS = 500;

export function useLiveKitLocalPublishing(
  params: UseLiveKitLocalPublishingParams,
): UseLiveKitLocalPublishingReturn {
  const {
    realtimeCoordinatorRef, livekitRoomRef,
    livekitConnected, realtimeCoordinatorState,
    isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled,
    activeStreamRef, activeScreenRef,
    hasActiveCall, usersInAudioRange,
    stream, screenStream,
  } = params;

  const trackPublicationCoordinatorRef = useRef(new TrackPublicationCoordinator());

  const despublicarTrackLocal = useCallback(async (
    tipo: 'audio' | 'video' | 'screen',
    stopOnUnpublish = true,
  ) => {
    const coordinator = realtimeCoordinatorRef.current;
    if (!coordinator) return;
    const source = tipo === 'audio' ? 'microphone' : tipo === 'video' ? 'camera' : 'screen_share';
    try {
      await coordinator.unpublishTracksBySource(source, stopOnUnpublish);
    } catch (e) {
      log.warn('Error despublicando track', { source, error: e instanceof Error ? e.message : String(e) });
    }
  }, [realtimeCoordinatorRef]);

  const getPublishedTrackIdBySource = useCallback((
    source: 'camera' | 'microphone' | 'screen_share',
  ): string | null => {
    const publication = realtimeCoordinatorRef.current?.getLocalTrackPublicationBySource(source);
    const localTrack = publication?.track as (LocalTrack & { mediaStreamTrack?: MediaStreamTrack }) | undefined;
    return localTrack?.mediaStreamTrack?.id ?? null;
  }, [realtimeCoordinatorRef]);

  const publicarTrackLocal = useCallback(async (
    track: MediaStreamTrack,
    tipo: 'audio' | 'video' | 'screen',
  ) => {
    const coordinator = realtimeCoordinatorRef.current;
    const room = livekitRoomRef.current;
    if (!coordinator || !room || room.state !== 'connected') return;
    const source = tipo === 'audio' ? 'microphone' : tipo === 'video' ? 'camera' : 'screen_share';
    const replaced = await coordinator.replaceTrackBySource(source, track);
    if (!replaced) {
      throw new Error(`No se pudo publicar/reemplazar track ${tipo}`);
    }
    log.info('Track publicado', { tipo, source });
  }, [realtimeCoordinatorRef, livekitRoomRef]);

  const sincronizarTracksLocales = useCallback(async () => {
    const room = livekitRoomRef.current;
    if (!room || room.state !== 'connected') return;

    const streamActual = activeStreamRef.current;
    const audioTrack = streamActual?.getAudioTracks()[0] ?? null;
    // Siempre publicar el track RAW de cámara — el background effect se aplica
    // vía setProcessor() en el LocalVideoTrack, no vía stream swap.
    const cameraTrack = streamActual?.getVideoTracks().find((t) => t.readyState === 'live') ?? null;
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
  }, [
    livekitRoomRef, activeStreamRef, activeScreenRef,
    isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled,
    getPublishedTrackIdBySource, publicarTrackLocal, despublicarTrackLocal,
  ]);

  // Sync tracks whenever the desired media flags or stream identity changes.
  const hasAnyoneNearbyForSync = hasActiveCall || usersInAudioRange.length > 0;
  useEffect(() => {
    if (!livekitConnected || !hasAnyoneNearbyForSync) return;
    sincronizarTracksLocales().catch((e: unknown) =>
      log.warn('Error sincronizando tracks locales', { error: e instanceof Error ? e.message : String(e) }),
    );
  }, [
    livekitConnected, hasAnyoneNearbyForSync, hasActiveCall,
    isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled,
    stream, screenStream, sincronizarTracksLocales,
  ]);

  // Proximity-based publish/unpublish with 500ms debounce.
  const prevHasAnyoneNearbyRef = useRef(false);
  const prevHasActiveCallRef = useRef(false);
  const publishDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnyoneNearby = hasActiveCall || usersInAudioRange.length > 0;

  useEffect(() => {
    if (!livekitConnected) return;
    const prevHasAnyoneNearby = prevHasAnyoneNearbyRef.current;
    const prevHasActiveCall = prevHasActiveCallRef.current;
    prevHasAnyoneNearbyRef.current = hasAnyoneNearby;
    prevHasActiveCallRef.current = hasActiveCall;

    if (!hasAnyoneNearby && prevHasAnyoneNearby) {
      if (publishDelayTimerRef.current) {
        clearTimeout(publishDelayTimerRef.current);
        publishDelayTimerRef.current = null;
      }
      // stopOnUnpublish: false — el MediaStreamTrack lo posee `useMediaStream`.
      // Detenerlo aquí obligaría a re-seleccionar mic/cámara al re-entrar en proximidad.
      (['audio', 'video', 'screen'] as const).forEach((t) =>
        despublicarTrackLocal(t, false).catch(() => {}),
      );
    } else if (!hasActiveCall && prevHasActiveCall && usersInAudioRange.length > 0) {
      if (publishDelayTimerRef.current) {
        clearTimeout(publishDelayTimerRef.current);
        publishDelayTimerRef.current = null;
      }
      despublicarTrackLocal('screen', false).catch(() => {});
    } else if (hasActiveCall && !prevHasActiveCall) {
      if (publishDelayTimerRef.current) clearTimeout(publishDelayTimerRef.current);
      publishDelayTimerRef.current = setTimeout(() => {
        publishDelayTimerRef.current = null;
        if (livekitRoomRef.current?.state === 'connected') {
          sincronizarTracksLocales().catch(() => {});
        }
      }, PROXIMITY_PUBLISH_DELAY_MS);
    } else if (hasAnyoneNearby && !prevHasAnyoneNearby && !hasActiveCall) {
      if (publishDelayTimerRef.current) clearTimeout(publishDelayTimerRef.current);
      publishDelayTimerRef.current = setTimeout(() => {
        publishDelayTimerRef.current = null;
        if (livekitRoomRef.current?.state === 'connected') {
          sincronizarTracksLocales().catch(() => {});
        }
      }, PROXIMITY_PUBLISH_DELAY_MS);
    }
    return () => {
      if (publishDelayTimerRef.current) {
        clearTimeout(publishDelayTimerRef.current);
        publishDelayTimerRef.current = null;
      }
    };
  }, [
    livekitConnected, hasActiveCall, hasAnyoneNearby,
    usersInAudioRange.length, despublicarTrackLocal, sincronizarTracksLocales,
    livekitRoomRef, stream,
  ]);

  // Expose the live LocalVideoTrack for camera effects pipeline.
  // Deps include `realtimeCoordinatorState` so the callback identity changes
  // when the publication changes (consumer hook re-runs its lifecycle).
  const getPublishedVideoTrack = useCallback((): LocalVideoTrack | null => {
    const coordinator = realtimeCoordinatorRef.current;
    if (!coordinator) return null;
    const pub = coordinator.getLocalTrackPublicationBySource('camera');
    if (!pub?.track) return null;
    if (pub.track instanceof LocalVideoTrack) return pub.track;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeCoordinatorRef, realtimeCoordinatorState]);

  return {
    publicarTrackLocal,
    despublicarTrackLocal,
    sincronizarTracksLocales,
    getPublishedVideoTrack,
  };
}
