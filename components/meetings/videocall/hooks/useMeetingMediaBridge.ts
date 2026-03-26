import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { loadCameraSettings, saveCameraSettings, loadAudioSettings, saveAudioSettings, type CameraSettings, type AudioSettings } from '@/modules/realtime-room';
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
      coordinator.updateDevicePreferences({ selectedCameraId: nextSettings.selectedCameraId || null });
      if (coordinator.getState().desiredCameraEnabled && nextSettings.selectedCameraId) {
        return coordinator.switchCamera(nextSettings.selectedCameraId);
      }
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

    coordinator.updateDevicePreferences({
      selectedMicrophoneId: nextSettings.selectedMicrophoneId || null,
      selectedSpeakerId: nextSettings.selectedSpeakerId || null,
    });

    const selectedMicrophoneChanged = partial.selectedMicrophoneId !== undefined;
    const processingChanged = partial.noiseReduction !== undefined
      || partial.noiseReductionLevel !== undefined
      || partial.echoCancellation !== undefined
      || partial.autoGainControl !== undefined;

    applyCoordinatorSettings(cameraSettings, nextSettings, processingChanged && !selectedMicrophoneChanged);

    if (selectedMicrophoneChanged && coordinator.getState().desiredMicrophoneEnabled && nextSettings.selectedMicrophoneId) {
      return coordinator.switchMicrophone(nextSettings.selectedMicrophoneId);
    }

    if (processingChanged) {
      await ensureProcessedAudioTrack();
    }

    return true;
  }, [applyCoordinatorSettings, cameraSettings, ensureProcessedAudioTrack]);

  const getPublication = useCallback((source: Track.Source) => {
    return room?.localParticipant.getTrackPublication(source) ?? null;
  }, [room]);

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
    if (effectiveVideoTrack) {
      if (cameraPublication?.track) {
        const localTrack = cameraPublication.track as unknown as MeetingMutableLocalTrack;
        if (localTrack.mediaStreamTrack?.id !== effectiveVideoTrack.id && typeof localTrack.replaceTrack === 'function') {
          await localTrack.replaceTrack(effectiveVideoTrack);
        }
        if (localTrack.isMuted && typeof localTrack.unmute === 'function') {
          await localTrack.unmute();
        }
      } else {
        await room.localParticipant.publishTrack(effectiveVideoTrack, {
          source: Track.Source.Camera,
          simulcast: true,
          videoEncoding: {
            maxBitrate: 1_700_000,
            maxFramerate: 24,
          },
        } as any);
      }
    } else if (cameraPublication?.track) {
      const localTrack = cameraPublication.track as unknown as MeetingMutableLocalTrack;
      if (!localTrack.isMuted && typeof localTrack.mute === 'function') {
        await localTrack.mute();
      }
    }

    const microphonePublication = getPublication(Track.Source.Microphone);
    if (audioTrack) {
      if (microphonePublication?.track) {
        const localTrack = microphonePublication.track as unknown as MeetingMutableLocalTrack;
        if (localTrack.mediaStreamTrack?.id !== audioTrack.id && typeof localTrack.replaceTrack === 'function') {
          await localTrack.replaceTrack(audioTrack);
        }
        if (localTrack.isMuted && typeof localTrack.unmute === 'function') {
          await localTrack.unmute();
        }
      } else {
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.Microphone,
          name: 'microphone',
        } as any);
      }
    } else if (microphonePublication?.track) {
      const localTrack = microphonePublication.track as unknown as MeetingMutableLocalTrack;
      if (!localTrack.isMuted && typeof localTrack.mute === 'function') {
        await localTrack.mute();
      }
    }
  }, [getPublication, mediaState.desiredCameraEnabled, mediaState.desiredMicrophoneEnabled, mediaState.effectiveStream, mediaState.stream, room]);

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
