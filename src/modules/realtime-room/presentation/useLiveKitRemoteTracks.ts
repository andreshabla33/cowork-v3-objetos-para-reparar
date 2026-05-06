/**
 * @module modules/realtime-room/presentation/useLiveKitRemoteTracks
 * @description Sub-hook of the P0-03 useLiveKit decomposition: owns the
 * remote-track state (`remoteStreams`, `remoteScreenStreams`,
 * `remoteAudioTracks`) and the lifecycle of remote video tracks
 * (attachment + render policies, mute/unmute/ended listeners, attachment
 * cleanup on participant disconnect / room reconnect / room teardown).
 *
 * Publishes the `onRemoteTrackSubscribed` / `onRemoteTrackUnsubscribed`
 * handlers via output refs that the Coordinator factory in
 * `useLiveKitRoomLifecycle` reads at construction time.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs (livekit-client):
 *   - Track / RemoteTrack / TrackPublication:
 *     https://docs.livekit.io/reference/client-sdk-js/classes/TrackPublication.html
 *   - Track.Kind / Track.Source enums:
 *     https://docs.livekit.io/reference/client-sdk-js/enums/Track.Kind.html
 *     https://docs.livekit.io/reference/client-sdk-js/enums/Track.Source.html
 *   - MediaStreamTrack lifecycle events (mute/unmute/ended): WHATWG Media
 *     Capture spec — used to drive RemoteRenderLifecyclePolicy expose/hide.
 */

import { useCallback, useRef, useState } from 'react';
import type { TrackPublication, RemoteParticipant } from 'livekit-client';
import { Track } from 'livekit-client';
import { RemoteRenderLifecyclePolicy, RemoteTrackAttachmentPolicy } from '@/modules/realtime-room';
import type { RemoteMediaLifecycleEvent } from '@/modules/realtime-room/application/RemoteMediaLifecycleDiagnostics';

type Slot = 'camera' | 'screen_share' | 'audio';

export interface UseLiveKitRemoteTracksParams {
  permitirMediaParticipante: (metadata?: string | null) => boolean;
  logRemoteMediaLifecycle: (event: RemoteMediaLifecycleEvent, payload?: Record<string, unknown>) => void;
  onRemoteTrackSubscribedOutRef: React.MutableRefObject<
    ((track: Track, pub: TrackPublication, participant: RemoteParticipant) => void) | null
  >;
  onRemoteTrackUnsubscribedOutRef: React.MutableRefObject<
    ((track: Track, pub: TrackPublication, participant: RemoteParticipant) => void) | null
  >;
}

export interface UseLiveKitRemoteTracksReturn {
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  remoteAudioTracks: Map<string, MediaStreamTrack>;
  /** Drop all track maps + policy caches + listeners. Used by limpiarLivekit. */
  resetAllRemoteTracksState: () => void;
  /** Cleanup tracks of a single peer. Used by onParticipantDisconnected and zombie cleanup. */
  cleanupParticipantTracks: (participantId: string) => void;
  /** Drop tracks/listeners of peers no longer in `activeIds`. Used by onReconnected. */
  cleanupStaleParticipants: (activeIds: Set<string>) => void;
  /** Direct setters exposed for cross-hook cleanups (zombie, lifecycle). */
  setRemoteStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setRemoteScreenStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setRemoteAudioTracks: React.Dispatch<React.SetStateAction<Map<string, MediaStreamTrack>>>;
  /** Policy/attachment ref maps exposed for limpiarLivekit telemetry payload. */
  remoteAttachedTrackIdsRef: React.MutableRefObject<{
    camera: Map<string, string>;
    screen_share: Map<string, string>;
    audio: Map<string, string>;
  }>;
  remoteRenderedTrackIdsRef: React.MutableRefObject<{
    camera: Map<string, string>;
    screen_share: Map<string, string>;
  }>;
}

export function useLiveKitRemoteTracks(
  params: UseLiveKitRemoteTracksParams,
): UseLiveKitRemoteTracksReturn {
  const {
    permitirMediaParticipante,
    logRemoteMediaLifecycle,
    onRemoteTrackSubscribedOutRef,
    onRemoteTrackUnsubscribedOutRef,
  } = params;

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteAudioTracks, setRemoteAudioTracks] = useState<Map<string, MediaStreamTrack>>(new Map());

  const remoteRenderLifecyclePolicyRef = useRef(new RemoteRenderLifecyclePolicy());
  const remoteTrackAttachmentPolicyRef = useRef(new RemoteTrackAttachmentPolicy());

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

  const getAttachedRemoteTrackId = useCallback(
    (slot: Slot, participantId: string): string | null =>
      remoteAttachedTrackIdsRef.current[slot].get(participantId) ?? null,
    [],
  );

  const setAttachedRemoteTrackId = useCallback(
    (slot: Slot, participantId: string, trackId: string | null) => {
      if (!trackId) {
        remoteAttachedTrackIdsRef.current[slot].delete(participantId);
        return;
      }
      remoteAttachedTrackIdsRef.current[slot].set(participantId, trackId);
    },
    [],
  );

  const getRenderedRemoteTrackId = useCallback(
    (slot: 'camera' | 'screen_share', participantId: string): string | null =>
      remoteRenderedTrackIdsRef.current[slot].get(participantId) ?? null,
    [],
  );

  const setRenderedRemoteTrackId = useCallback(
    (slot: 'camera' | 'screen_share', participantId: string, trackId: string | null) => {
      if (!trackId) {
        remoteRenderedTrackIdsRef.current[slot].delete(participantId);
        return;
      }
      remoteRenderedTrackIdsRef.current[slot].set(participantId, trackId);
    },
    [],
  );

  const clearRemoteVideoTrackListener = useCallback(
    (listenerKey: string) => {
      const cleanup = remoteVideoTrackListenerCleanupRef.current.get(listenerKey);
      if (!cleanup) return;
      cleanup();
      remoteVideoTrackListenerCleanupRef.current.delete(listenerKey);
      const [participantId, slot, trackId] = listenerKey.split(':');
      logRemoteMediaLifecycle('video_lifecycle_listener_unbound', { participantId, slot, trackId });
    },
    [logRemoteMediaLifecycle],
  );

  const clearRemoteVideoTrackListenersForParticipant = useCallback(
    (participantId: string) => {
      Array.from(remoteVideoTrackListenerCleanupRef.current.keys())
        .filter((listenerKey) => listenerKey.startsWith(`${participantId}:`))
        .forEach((listenerKey) => clearRemoteVideoTrackListener(listenerKey));
    },
    [clearRemoteVideoTrackListener],
  );

  const applyRemoteRenderedVideoState = useCallback(
    (
      participantId: string,
      slot: 'camera' | 'screen_share',
      track: MediaStreamTrack,
      trigger: 'subscribed' | 'mute' | 'unmute' | 'ended' | 'rebind',
    ) => {
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

      if (decision.action === 'noop') return;

      const setter = slot === 'screen_share' ? setRemoteScreenStreams : setRemoteStreams;

      if (decision.action === 'expose') {
        setter((prev) => {
          const next = new Map(prev);
          next.set(participantId, new MediaStream([track]));
          return next;
        });
        setRenderedRemoteTrackId(slot, participantId, track.id);
        logRemoteMediaLifecycle('video_render_exposed', {
          participantId, slot, trackId: track.id, trigger,
          currentAttachedTrackId, currentRenderedTrackId,
          readyState: track.readyState, muted: track.muted,
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
        participantId, slot, trackId: track.id, trigger,
        currentAttachedTrackId, currentRenderedTrackId,
        readyState: track.readyState, muted: track.muted, isRenderReady,
      });
    },
    [getAttachedRemoteTrackId, getRenderedRemoteTrackId, setRenderedRemoteTrackId, logRemoteMediaLifecycle],
  );

  const bindRemoteVideoTrackLifecycle = useCallback(
    (participantId: string, slot: 'camera' | 'screen_share', track: MediaStreamTrack) => {
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
    },
    [applyRemoteRenderedVideoState, logRemoteMediaLifecycle],
  );

  // ─── Coordinator handlers (published via output refs) ──────────────────────
  onRemoteTrackSubscribedOutRef.current = (track, _pub, participant) => {
    if (!participant || !track) return;
    const detectedSlot: Slot = track.kind === Track.Kind.Video
      ? (track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera')
      : 'audio';
    logRemoteMediaLifecycle('track_subscribed', {
      participantId: participant.identity,
      slot: detectedSlot,
      kind: track.kind,
      trackId: track.mediaStreamTrack?.id,
      source: track.source,
    });
    if (!permitirMediaParticipante(participant.metadata)) {
      logRemoteMediaLifecycle('track_subscription_skipped', {
        participantId: participant.identity,
        slot: detectedSlot,
        kind: track.kind,
        trackId: track.mediaStreamTrack?.id,
        reason: 'participant_media_not_allowed',
      });
      return;
    }
    if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
      const slot: 'camera' | 'screen_share' = track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera';
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
      logRemoteMediaLifecycle('track_attached', { participantId: participant.identity, slot, kind: track.kind, trackId: track.mediaStreamTrack.id });
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
      setRemoteAudioTracks((prev) => new Map(prev).set(participant.identity, track.mediaStreamTrack!));
      setAttachedRemoteTrackId('audio', participant.identity, track.mediaStreamTrack.id);
      logRemoteMediaLifecycle('track_attached', { participantId: participant.identity, slot: 'audio', kind: track.kind, trackId: track.mediaStreamTrack.id });
    }
  };

  onRemoteTrackUnsubscribedOutRef.current = (track, _pub, participant) => {
    if (!participant || !track) return;
    const detectedSlot: Slot = track.kind === Track.Kind.Video
      ? (track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera')
      : 'audio';
    logRemoteMediaLifecycle('track_unsubscribed', {
      participantId: participant.identity,
      slot: detectedSlot,
      kind: track.kind,
      trackId: track.mediaStreamTrack?.id,
      source: track.source,
    });
    if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
      const slot: 'camera' | 'screen_share' = track.source === Track.Source.ScreenShare ? 'screen_share' : 'camera';
      clearRemoteVideoTrackListener(`${participant.identity}:${slot}:${track.mediaStreamTrack.id}`);
      const decision = remoteTrackAttachmentPolicyRef.current.onTrackUnsubscribed({
        participantId: participant.identity,
        slot,
        trackId: track.mediaStreamTrack.id,
        currentTrackId: getAttachedRemoteTrackId(slot, participant.identity),
      });
      if (decision.action !== 'detach') {
        logRemoteMediaLifecycle('track_detach_skipped', {
          participantId: participant.identity, slot, kind: track.kind, trackId: track.mediaStreamTrack.id,
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
        setter((prev) => {
          const next = new Map(prev);
          next.delete(participant.identity);
          return next;
        });
        setRenderedRemoteTrackId(slot, participant.identity, null);
      }
      setAttachedRemoteTrackId(slot, participant.identity, null);
      logRemoteMediaLifecycle('track_detached', { participantId: participant.identity, slot, kind: track.kind, trackId: track.mediaStreamTrack.id });
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
          participantId: participant.identity, slot: 'audio', kind: track.kind, trackId: track.mediaStreamTrack.id,
          reason: 'stale_track_or_already_detached',
          currentAttachedTrackId: getAttachedRemoteTrackId('audio', participant.identity),
        });
        return;
      }
      setRemoteAudioTracks((prev) => {
        const next = new Map(prev);
        next.delete(participant.identity);
        return next;
      });
      setAttachedRemoteTrackId('audio', participant.identity, null);
      logRemoteMediaLifecycle('track_detached', { participantId: participant.identity, slot: 'audio', kind: track.kind, trackId: track.mediaStreamTrack.id });
    }
  };

  // ─── Cross-hook cleanup helpers ────────────────────────────────────────────
  const cleanupParticipantTracks = useCallback((participantId: string) => {
    clearRemoteVideoTrackListenersForParticipant(participantId);
    remoteTrackAttachmentPolicyRef.current
      .buildParticipantDetachPlan(remoteAttachedTrackIdsRef.current, participantId)
      .forEach((decision) => {
        setAttachedRemoteTrackId(decision.slot, decision.participantId, null);
      });
    remoteRenderLifecyclePolicyRef.current
      .buildParticipantHidePlan(remoteRenderedTrackIdsRef.current, participantId)
      .forEach((decision) => {
        setRenderedRemoteTrackId(decision.slot, decision.participantId, null);
      });
    setRemoteStreams((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
    setRemoteScreenStreams((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
    setRemoteAudioTracks((prev) => { const n = new Map(prev); n.delete(participantId); return n; });
  }, [clearRemoteVideoTrackListenersForParticipant, setAttachedRemoteTrackId, setRenderedRemoteTrackId]);

  const cleanupStaleParticipants = useCallback((activeIds: Set<string>) => {
    setRemoteStreams((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!activeIds.has(id)) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });
    setRemoteScreenStreams((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!activeIds.has(id)) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });
    setRemoteAudioTracks((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!activeIds.has(id)) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });
    (['camera', 'screen_share', 'audio'] as const).forEach((slot) => {
      const map = remoteAttachedTrackIdsRef.current[slot];
      for (const id of Array.from(map.keys())) {
        if (!activeIds.has(id)) map.delete(id);
      }
    });
    (['camera', 'screen_share'] as const).forEach((slot) => {
      const map = remoteRenderedTrackIdsRef.current[slot];
      for (const id of Array.from(map.keys())) {
        if (!activeIds.has(id)) map.delete(id);
      }
    });
    Array.from(remoteVideoTrackListenerCleanupRef.current.keys()).forEach((listenerKey) => {
      const [participantId] = listenerKey.split(':');
      if (!activeIds.has(participantId)) {
        clearRemoteVideoTrackListener(listenerKey);
      }
    });
  }, [clearRemoteVideoTrackListener]);

  const resetAllRemoteTracksState = useCallback(() => {
    Array.from(remoteVideoTrackListenerCleanupRef.current.keys()).forEach((listenerKey) => {
      clearRemoteVideoTrackListener(listenerKey);
    });
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
    setRemoteStreams(new Map());
    setRemoteScreenStreams(new Map());
    setRemoteAudioTracks(new Map());
  }, [clearRemoteVideoTrackListener, logRemoteMediaLifecycle]);

  return {
    remoteStreams,
    remoteScreenStreams,
    remoteAudioTracks,
    resetAllRemoteTracksState,
    cleanupParticipantTracks,
    cleanupStaleParticipants,
    setRemoteStreams,
    setRemoteScreenStreams,
    setRemoteAudioTracks,
    remoteAttachedTrackIdsRef,
    remoteRenderedTrackIdsRef,
  };
}
