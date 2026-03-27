import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { TrackPublicationCoordinator, crearOpcionesPublicacionTrackLiveKit, loadCameraSettings, saveCameraSettings, loadAudioSettings, saveAudioSettings, type CameraSettings, type AudioSettings } from '@/modules/realtime-room';
import { createProcessedAudioTrack, type ProcessedAudioTrackHandle } from '@/lib/audioProcessing';
import { SpaceMediaCoordinator, type SpaceMediaCoordinatorState } from '@/modules/realtime-room';

type MeetingMutableLocalTrack = {
  mediaStreamTrack?: MediaStreamTrack;
  replaceTrack?: (track: MediaStreamTrack) => Promise<unknown>;
  unmute?: () => Promise<unknown>;
  mute?: () => Promise<unknown>;
  isMuted?: boolean;
};

interface UseMeetingMediaBridgeParams {
  room?: Room | null;
  initialCameraEnabled: boolean;
  initialMicrophoneEnabled: boolean;
}

const createInitialMediaState = (): SpaceMediaCoordinatorState => ({
  stream: null,
  processedStream: null,
  effectiveStream: null,
  screenShareSession: { active: false, withAudio: false },
  preflightCheck: {
    camera: 'unknown',
    microphone: 'unknown',
    hasCameraDevice: false,
    hasMicrophoneDevice: false,
    cameraTrackReady: false,
    microphoneTrackReady: false,
    errors: [],
    ready: false,
  },
  devicePreferences: {
    selectedCameraId: null,
    selectedMicrophoneId: null,
    selectedSpeakerId: null,
  },
  audioProcessingOptions: {
    noiseReduction: true,
    noiseReductionLevel: 'standard',
    echoCancellation: true,
    autoGainControl: true,
  },
  desiredCameraEnabled: false,
  desiredMicrophoneEnabled: false,
  desiredScreenShareEnabled: false,
  isCameraEnabled: false,
  isMicrophoneEnabled: false,
});

const getLevel = (audioSettings: AudioSettings): 'standard' | 'enhanced' => (
  audioSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : 'standard'
);

export const useMeetingMediaBridge = ({
  room,
  initialCameraEnabled,
  initialMicrophoneEnabled,
}: UseMeetingMediaBridgeParams) => {
  const coordinatorRef = useRef<SpaceMediaCoordinator | null>(null);
  const coordinadorPublicacionTracksRef = useRef(new TrackPublicationCoordinator());
  const processedAudioHandleRef = useRef<ProcessedAudioTrackHandle | null>(null);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(loadCameraSettings);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings);
  const [mediaState, setMediaState] = useState<SpaceMediaCoordinatorState>(createInitialMediaState);

  if (!coordinatorRef.current) {
    coordinatorRef.current = new SpaceMediaCoordinator({
      onStateChange: (nextState) => {
        setMediaState(nextState);
      },
    });
  }

  const cleanupProcessedAudio = useCallback(() => {
    const current = processedAudioHandleRef.current;
    if (!current) {
      return;
    }

    current.dispose();
    processedAudioHandleRef.current = null;
  }, []);

  const applyCoordinatorSettings = useCallback((nextCameraSettings: CameraSettings, nextAudioSettings: AudioSettings, reapplyAudioTrack: boolean = false) => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return;
    }

    coordinator.updateDevicePreferences({
      selectedCameraId: nextCameraSettings.selectedCameraId || null,
      selectedMicrophoneId: nextAudioSettings.selectedMicrophoneId || null,
      selectedSpeakerId: nextAudioSettings.selectedSpeakerId || null,
    });
    coordinator.updateAudioProcessingOptions({
      noiseReduction: nextAudioSettings.noiseReduction,
      noiseReductionLevel: nextAudioSettings.noiseReductionLevel === 'enhanced'
        ? 'enhanced'
        : nextAudioSettings.noiseReductionLevel === 'off'
          ? 'off'
          : 'standard',
      echoCancellation: nextAudioSettings.echoCancellation,
      autoGainControl: nextAudioSettings.autoGainControl,
    }, reapplyAudioTrack);
  }, []);

  const ensureProcessedAudioTrack = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return;
    }

    const snapshot = coordinator.getState();
    const baseStream = snapshot.stream;
    const currentAudioTrack = baseStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;

    if (!currentAudioTrack) {
      cleanupProcessedAudio();
      return;
    }

    if (!audioSettings.noiseReduction || audioSettings.noiseReductionLevel === 'off') {
      cleanupProcessedAudio();
      return;
    }

    if (
      processedAudioHandleRef.current?.sourceTrack.id === currentAudioTrack.id ||
      processedAudioHandleRef.current?.track.id === currentAudioTrack.id
    ) {
      return;
    }

    cleanupProcessedAudio();

    const handle = await createProcessedAudioTrack(currentAudioTrack, getLevel(audioSettings));
    if (!handle) {
      return;
    }

    processedAudioHandleRef.current = handle;
    const nextStream = new MediaStream([
      handle.track,
      ...baseStream?.getVideoTracks() ?? [],
    ]);

    coordinator.syncExternalMediaState({
      stream: nextStream,
      processedStream: snapshot.processedStream,
      screenShareSession: snapshot.screenShareSession,
      desiredCameraEnabled: snapshot.desiredCameraEnabled,
      desiredMicrophoneEnabled: snapshot.desiredMicrophoneEnabled,
      desiredScreenShareEnabled: snapshot.desiredScreenShareEnabled,
    });
  }, [audioSettings, cleanupProcessedAudio]);

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return;
    }

    let cancelled = false;

    const init = async () => {
      applyCoordinatorSettings(cameraSettings, audioSettings, false);
      await coordinator.initialize(initialCameraEnabled, initialMicrophoneEnabled);
      coordinator.setDesiredMediaState({
        cameraEnabled: initialCameraEnabled,
        microphoneEnabled: initialMicrophoneEnabled,
      });

      let started = await coordinator.startMedia(initialCameraEnabled, initialMicrophoneEnabled);
      if (!started && initialCameraEnabled && initialMicrophoneEnabled) {
        started = await coordinator.startMedia(false, true);
        if (started && !cancelled) {
          coordinator.setDesiredMediaState({
            cameraEnabled: false,
            microphoneEnabled: true,
          });
        }
      }

      if (!cancelled) {
        await ensureProcessedAudioTrack();
      }
    };

    void init();

    return () => {
      cancelled = true;
      coordinator.setProcessedStream(null);
      coordinator.stopMedia();
      coordinator.getDeviceManager().destroy();
      cleanupProcessedAudio();
    };
  }, [applyCoordinatorSettings, cleanupProcessedAudio, ensureProcessedAudioTrack, initialCameraEnabled, initialMicrophoneEnabled]);

  const updateCameraSettings = useCallback(async (partial: Partial<CameraSettings>) => {
    const coordinator = coordinatorRef.current;
    let nextSettings: CameraSettings | null = null;

    setCameraSettings((current) => {
      nextSettings = { ...current, ...partial };
      saveCameraSettings(nextSettings);
      return nextSettings;
    });

    if (!nextSettings || !coordinator) {
      return false;
    }

    if (partial.selectedCameraId !== undefined) {
      // Compare BEFORE calling updateDevicePreferences to avoid an unnecessary
      // notifyStateChange() that disrupts the LiveKit publish cycle.
      const activeVideoTrack = coordinator.getState().stream?.getVideoTracks()[0];
      const activeDeviceId = activeVideoTrack?.getSettings().deviceId;
      const cameraActuallyChanged = nextSettings.selectedCameraId !== activeDeviceId;

      if (cameraActuallyChanged) {
        coordinator.updateDevicePreferences({ selectedCameraId: nextSettings.selectedCameraId || null });
        if (coordinator.getState().desiredCameraEnabled && nextSettings.selectedCameraId) {
          return coordinator.switchCamera(nextSettings.selectedCameraId);
        }
      }
      // If camera didn't change, skip updateDevicePreferences entirely to avoid
      // notifyStateChange() during the critical track-publish window.
    }

    return true;
  }, []);

  const updateAudioSettings = useCallback(async (partial: Partial<AudioSettings>) => {
    const coordinator = coordinatorRef.current;
    let nextSettings: AudioSettings | null = null;

    setAudioSettings((current) => {
      nextSettings = { ...current, ...partial };
      saveAudioSettings(nextSettings);
      return nextSettings;
    });

    if (!nextSettings || !coordinator) {
      return false;
    }

    const selectedMicrophoneChanged = partial.selectedMicrophoneId !== undefined;
    const selectedSpeakerChanged = partial.selectedSpeakerId !== undefined;
    const processingChanged = partial.noiseReduction !== undefined
      || partial.noiseReductionLevel !== undefined
      || partial.echoCancellation !== undefined
      || partial.autoGainControl !== undefined;

    const activeAudioTrack = coordinator.getState().stream?.getAudioTracks()[0];
    const activeMicrophoneId = activeAudioTrack?.getSettings().deviceId || null;
    const microphoneActuallyChanged = selectedMicrophoneChanged
      && (nextSettings.selectedMicrophoneId || null) !== activeMicrophoneId;

    const currentSpeakerId = coordinator.getState().devicePreferences.selectedSpeakerId || null;
    const speakerActuallyChanged = selectedSpeakerChanged
      && (nextSettings.selectedSpeakerId || null) !== currentSpeakerId;

    if (microphoneActuallyChanged || speakerActuallyChanged) {
      coordinator.updateDevicePreferences({
        selectedMicrophoneId: microphoneActuallyChanged ? (nextSettings.selectedMicrophoneId || null) : undefined,
        selectedSpeakerId: speakerActuallyChanged ? (nextSettings.selectedSpeakerId || null) : undefined,
      });
    }

    if (processingChanged) {
      coordinator.updateAudioProcessingOptions({
        noiseReduction: nextSettings.noiseReduction,
        noiseReductionLevel: nextSettings.noiseReductionLevel === 'enhanced'
          ? 'enhanced'
          : nextSettings.noiseReductionLevel === 'off'
            ? 'off'
            : 'standard',
        echoCancellation: nextSettings.echoCancellation,
        autoGainControl: nextSettings.autoGainControl,
      }, false);
    }

    if (microphoneActuallyChanged && coordinator.getState().desiredMicrophoneEnabled && nextSettings.selectedMicrophoneId) {
      const changed = await coordinator.switchMicrophone(nextSettings.selectedMicrophoneId);
      if (changed) {
        await ensureProcessedAudioTrack();
      }
      return changed;
    }

    if (processingChanged) {
      const currentMicrophoneId = nextSettings.selectedMicrophoneId || activeMicrophoneId;
      if (coordinator.getState().desiredMicrophoneEnabled && currentMicrophoneId) {
        const reapplied = await coordinator.switchMicrophone(currentMicrophoneId);
        if (!reapplied) {
          return false;
        }
      }
      await ensureProcessedAudioTrack();
    }

    return true;
  }, [ensureProcessedAudioTrack]);

  const getPublication = useCallback((source: Track.Source) => {
    return room?.localParticipant.getTrackPublication(source) ?? null;
  }, [room]);

  const getPublishedMediaTrackId = useCallback((source: Track.Source) => {
    const publication = getPublication(source);
    const localTrack = publication?.track as unknown as MeetingMutableLocalTrack | undefined;
    return localTrack?.mediaStreamTrack?.id ?? null;
  }, [getPublication]);

  const stabilizeMicrophoneAfterCameraToggle = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return;
    }

    const snapshot = coordinator.getState();
    if (!snapshot.desiredMicrophoneEnabled) {
      return;
    }

    const audioTrack = snapshot.stream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
    if (audioTrack) {
      if (!audioTrack.enabled) {
        audioTrack.enabled = true;
        coordinator.syncExternalMediaState({
          stream: snapshot.stream,
          processedStream: snapshot.processedStream,
          screenShareSession: snapshot.screenShareSession,
          desiredCameraEnabled: snapshot.desiredCameraEnabled,
          desiredMicrophoneEnabled: snapshot.desiredMicrophoneEnabled,
          desiredScreenShareEnabled: snapshot.desiredScreenShareEnabled,
        });
      }
      return;
    }

    await coordinator.toggleMicrophone(true);
  }, []);

  const syncPublishedTracks = useCallback(async () => {
    if (!room || room.state !== 'connected') {
      return;
    }

    const effectiveVideoTrack = mediaState.desiredCameraEnabled
      ? mediaState.effectiveStream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null
      : null;
    const audioTrack = mediaState.desiredMicrophoneEnabled
      ? mediaState.stream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null
      : null;

    const cameraPublication = getPublication(Track.Source.Camera);
    const microphonePublication = getPublication(Track.Source.Microphone);
    const syncPlan = coordinadorPublicacionTracksRef.current.buildSyncPlan({
      desiredMicrophoneEnabled: mediaState.desiredMicrophoneEnabled,
      desiredCameraEnabled: mediaState.desiredCameraEnabled,
      desiredScreenShareEnabled: false,
      microphoneTrack: audioTrack,
      cameraTrack: effectiveVideoTrack,
      screenShareTrack: null,
      publishedTrackIds: {
        microphone: getPublishedMediaTrackId(Track.Source.Microphone),
        camera: getPublishedMediaTrackId(Track.Source.Camera),
        screen_share: null,
      },
    });

    for (const item of syncPlan.items) {
      if (item.source === 'screen_share') {
        continue;
      }

      const publication = item.source === 'camera' ? cameraPublication : microphonePublication;
      const localTrack = publication?.track as unknown as MeetingMutableLocalTrack | undefined;

      if (item.action === 'publish_or_replace' && item.track) {
        if (publication?.track) {
          if (localTrack.mediaStreamTrack?.id !== item.track.id && typeof localTrack.replaceTrack === 'function') {
            await localTrack.replaceTrack(item.track);
          }
          if (localTrack.isMuted && typeof localTrack.unmute === 'function') {
            await localTrack.unmute();
          }
        } else {
          await room.localParticipant.publishTrack(item.track, crearOpcionesPublicacionTrackLiveKit(item.source));
        }
      } else if (item.action === 'unpublish' && publication?.track) {
        if (!localTrack.isMuted && typeof localTrack.mute === 'function') {
          await localTrack.mute();
        }
      }

      if (localTrack && item.targetTrackEnabled !== undefined) {
        if (item.targetTrackEnabled && localTrack.isMuted && typeof localTrack.unmute === 'function') {
          await localTrack.unmute();
        }
        if (!item.targetTrackEnabled && !localTrack.isMuted && typeof localTrack.mute === 'function') {
          await localTrack.mute();
        }
      }

      if (item.track && item.targetTrackEnabled !== undefined) {
        item.track.enabled = item.targetTrackEnabled;
      }
    }
  }, [getPublication, getPublishedMediaTrackId, mediaState.desiredCameraEnabled, mediaState.desiredMicrophoneEnabled, mediaState.effectiveStream, mediaState.stream, room]);

  useEffect(() => {
    const handlePageExit = () => {
      cleanupProcessedAudio();
      coordinatorRef.current?.setProcessedStream(null);
      coordinatorRef.current?.stopMedia();
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [cleanupProcessedAudio]);

  useEffect(() => {
    if (!room || room.state !== 'connected') {
      return;
    }

    void syncPublishedTracks();
  }, [mediaState.desiredCameraEnabled, mediaState.desiredMicrophoneEnabled, mediaState.effectiveStream, mediaState.stream, room, syncPublishedTracks]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const handleConnected = () => {
      void syncPublishedTracks();
    };

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Reconnected, handleConnected);
    room.on(RoomEvent.LocalTrackPublished, handleConnected);
    room.on(RoomEvent.LocalTrackUnpublished, handleConnected);

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.Reconnected, handleConnected);
      room.off(RoomEvent.LocalTrackPublished, handleConnected);
      room.off(RoomEvent.LocalTrackUnpublished, handleConnected);
    };
  }, [room, syncPublishedTracks]);

  useEffect(() => {
    void ensureProcessedAudioTrack();
  }, [ensureProcessedAudioTrack, mediaState.stream]);

  const toggleCamera = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return false;
    }

    const nextEnabled = !coordinator.getState().desiredCameraEnabled;
    const result = await coordinator.toggleCamera(nextEnabled);
    if (!nextEnabled) {
      coordinator.setProcessedStream(null);
    }

    if (result) {
      await stabilizeMicrophoneAfterCameraToggle();
      await ensureProcessedAudioTrack();
    }

    return result;
  }, [ensureProcessedAudioTrack, stabilizeMicrophoneAfterCameraToggle]);

  const toggleMicrophone = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return false;
    }

    const nextEnabled = !coordinator.getState().desiredMicrophoneEnabled;
    const result = await coordinator.toggleMicrophone(nextEnabled);
    if (nextEnabled) {
      await ensureProcessedAudioTrack();
    }
    return result;
  }, [ensureProcessedAudioTrack]);

  const setProcessedStream = useCallback((stream: MediaStream | null) => {
    coordinatorRef.current?.setProcessedStream(stream);
  }, []);

  const stopMediaCapture = useCallback(() => {
    cleanupProcessedAudio();
    coordinatorRef.current?.setProcessedStream(null);
    coordinatorRef.current?.stopMedia();
  }, [cleanupProcessedAudio]);

  // Key estable para VideoWithBackground - previene remounts al togglear mic
  const videoBackgroundKey = useMemo(() => {
    if (!mediaState.stream) return 'no-stream';
    const videoTrack = mediaState.stream.getVideoTracks()[0];
    return videoTrack?.id || 'no-video-track';
  }, [mediaState.stream]);

  return {
    cameraSettings,
    audioSettings,
    mediaState,
    speakerDeviceId: audioSettings.selectedSpeakerId || undefined,
    isLocalVideoProcessed: cameraSettings.backgroundEffect !== 'none' && !!mediaState.processedStream,
    videoBackgroundKey,
    updateCameraSettings,
    updateAudioSettings,
    toggleCamera,
    toggleMicrophone,
    setProcessedStream,
    stopMediaCapture,
  };
};
