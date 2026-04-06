import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Room, RoomEvent, Track, LocalVideoTrack } from 'livekit-client';
import { TrackPublicationCoordinator, crearOpcionesPublicacionTrackLiveKit, loadCameraSettings, saveCameraSettings, loadAudioSettings, saveAudioSettings, type CameraSettings, type AudioSettings } from '@/modules/realtime-room';
import { createProcessedAudioTrack, type ProcessedAudioTrackHandle } from '@/lib/audioProcessing';
import { SpaceMediaCoordinator, type SpaceMediaCoordinatorState } from '@/modules/realtime-room';
import { getLocalVideoTrackFactory } from '@/src/core/infrastructure/adapters/LocalVideoTrackFactory';
import { GestionarBackgroundVideoUseCase } from '@/src/core/application/usecases/GestionarBackgroundVideoUseCase';
import { getLiveKitBackgroundAdapter } from '@/src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter';
import { logger } from '@/lib/logger';

const log = logger.child('useMeetingMediaBridge');

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
  const [previewVideoTrack, setPreviewVideoTrack] = useState<LocalVideoTrack | null>(null);

  /**
   * Timer para deferred cleanup del effect de inicialización de media.
   *
   * REACT STRICT MODE — Deferred Cleanup Pattern:
   *   mount#1 → init() → getUserMedia() → MediaStream con track A
   *   cleanup#1 → setTimeout(stopMedia, 0) → guarda timerId en ref
   *   mount#2 → clearTimeout(timerId) [CANCELA stopMedia] → init() reutiliza stream A
   *
   * Sin este patrón, cleanup#1 llamaría stopMedia() destruyendo los
   * MediaStreamTracks. mount#2 llamaría startMedia() nuevamente obteniendo
   * un track con ID diferente → VideoWithBackground recibe dos trackIds
   * distintos → 2 inits de WASM (freeze de ~300ms en GPU).
   *
   * En un unmount REAL, no hay remount que cancele el timer → stopMedia()
   * se ejecuta normalmente liberando todos los recursos de cámara/micrófono.
   */
  const deferredMediaCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Mutex síncrono para serializar init() bajo React Strict Mode.
   *
   * React Strict Mode bajo ciertas optimizaciones de V8 (Promise ya resuelta →
   * microtask continuation ejecutada síncronamente) puede hacer que dos init()
   * pasen el `cancelled` check concurrentemente antes de que cleanup#1 corra.
   *
   * Este ref garantiza que solo UN init() esté activo en cualquier momento:
   *   - Effect#1 → initInFlightRef=true → void init#1()
   *   - Cleanup#1 → initInFlightRef=false (libera para mount#2)
   *   - Effect#2 → initInFlightRef=false → initInFlightRef=true → void init#2()
   *   - Finally de init#1 → initInFlightRef=false (idempotente si cleanup ya lo reset)
   */
  const initInFlightRef = useRef(false);

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

    // ── Deferred cleanup guard (React Strict Mode safe) ──────────────────
    // Si hay un stopMedia() diferido de un cleanup anterior, cancelarlo.
    // Bajo Strict Mode: mount#2 cancela el stopMedia() de cleanup#1 →
    // el stream y los MediaStreamTracks de mount#1 sobreviven →
    // previewVideoTrack reutiliza el mismo wrapper (mismo trackId) →
    // VideoWithBackground recibe el mismo track → 1 solo WASM init.
    if (deferredMediaCleanupRef.current !== null) {
      clearTimeout(deferredMediaCleanupRef.current);
      deferredMediaCleanupRef.current = null;
      log.info('[Bridge] deferred cleanup cancelado → remount Strict Mode detectado');
    }

    // ── Mutex de init() (defensa en profundidad) ──────────────────────────
    // Si initInFlightRef es true, hay un init() activo que aún no entregó
    // su result. Bajo Strict Mode: Cleanup#1 resetea el flag ANTES de que
    // Effect#2 corra, por lo que este guard nunca se activa en el caso normal.
    // Su valor es proteger casos edge donde el timing es diferente (ej. modo
    // concurrent rendering con suspense).
    if (initInFlightRef.current) {
      log.info('[Bridge] MUTEX: init en vuelo detectado — Effect omitido');
      return;
    }

    initInFlightRef.current = true;
    let cancelled = false;

    log.info('[Bridge] init() INICIO', { initialCameraEnabled, initialMicrophoneEnabled });

    const init = async () => {
      try {
        applyCoordinatorSettings(cameraSettings, audioSettings, false);
        await coordinator.initialize(initialCameraEnabled, initialMicrophoneEnabled);

        // ── CRITICAL: cancelled check post-await ─────────────────────────
        // Bajo React Strict Mode:
        //   mount#1 → void init() → await initialize() [microtask M1]
        //   cleanup#1 → cancelled = true (síncrono, ANTES de M1)
        //   mount#2 → void init() → await initialize() [microtask M2]
        //   M1: init#1 reanuda → cancelled===true → RETURN ✓
        //   M2: init#2 reanuda → cancelled===false → startMedia() ✓
        if (cancelled) {
          log.info('[Bridge] init() CANCELADO post-initialize → Strict Mode cleanup#1 correcto');
          return;
        }

        coordinator.setDesiredMediaState({
          cameraEnabled: initialCameraEnabled,
          microphoneEnabled: initialMicrophoneEnabled,
        });

        log.info('[Bridge] llamando startMedia()', { initialCameraEnabled, initialMicrophoneEnabled });
        let started = await coordinator.startMedia(initialCameraEnabled, initialMicrophoneEnabled);

        // Check post-await: startMedia() es async (getUserMedia) →
        // cancelled pudo cambiar durante la espera
        if (cancelled) {
          log.info('[Bridge] init() CANCELADO post-startMedia');
          return;
        }

        if (!started && initialCameraEnabled && initialMicrophoneEnabled) {
          log.info('[Bridge] startMedia(true,true) falló — reintentando con solo audio');
          started = await coordinator.startMedia(false, true);
          if (cancelled) return;
          if (started) {
            coordinator.setDesiredMediaState({
              cameraEnabled: false,
              microphoneEnabled: true,
            });
          }
        }

        log.info('[Bridge] init() COMPLETADO', { started });

        if (!cancelled) {
          await ensureProcessedAudioTrack();
        }
      } finally {
        // Liberar mutex al terminar (sea por éxito, error o cancellation).
        // Si cleanup ya lo reseteó, esta asignación es idempotente.
        initInFlightRef.current = false;
      }
    };

    void init();

    return () => {
      cancelled = true;
      // ── Liberar mutex en cleanup ──────────────────────────────────────
      // Permite que el próximo mount real (después de un unmount real) pueda
      // iniciar su propio init() sin que el mutex lo bloquee.
      initInFlightRef.current = false;
      log.info('[Bridge] cleanup() ejecutado → cancelled=true, mutex liberado');

      // Diferir la destrucción de media al siguiente macrotask.
      // Si React Strict Mode hace remount, mount#2 cancela este timer
      // ANTES de que stopMedia() destruya los MediaStreamTracks.
      // En un unmount real, el timer dispara y libera todos los recursos.
      deferredMediaCleanupRef.current = setTimeout(() => {
        deferredMediaCleanupRef.current = null;
        log.info('[Bridge] deferred stopMedia() ejecutado (unmount real)');
        coordinator.stopMedia();
        coordinator.getDeviceManager().destroy();
        cleanupProcessedAudio();
      }, 0);
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

  /**
   * Devuelve el LocalVideoTrack publicado actualmente, o null si no está publicado.
   * Usado por VideoWithBackground para el path nativo (@livekit/track-processors).
   */
  const getLocalVideoTrack = useCallback(() => {
    const publication = room?.localParticipant.getTrackPublication(Track.Source.Camera);
    return (publication?.track as import('livekit-client').LocalVideoTrack | undefined) ?? null;
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

  const isSyncingRef = useRef(false);

  const syncPublishedTracks = useCallback(async () => {
    if (!room || room.state !== 'connected') {
      return;
    }

    // Guard against re-entrant calls caused by RoomEvent.Connected/Reconnected
    // firing during an in-flight publishTrack/replaceTrack.
    if (isSyncingRef.current) {
      return;
    }
    isSyncingRef.current = true;

    try {
      // El video track se obtiene directamente del stream base. El processor
      // se aplica in-place via track.setProcessor() del SDK de LiveKit —
      // no genera un stream separado (eliminado: effectiveStream deprecated).
      const effectiveVideoTrack = mediaState.desiredCameraEnabled
        ? mediaState.stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null
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
    } finally {
      isSyncingRef.current = false;
    }
  }, [getPublication, getPublishedMediaTrackId, mediaState.desiredCameraEnabled, mediaState.desiredMicrophoneEnabled, mediaState.stream, room]);

  useEffect(() => {
    const handlePageExit = () => {
      cleanupProcessedAudio();
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
  }, [mediaState.desiredCameraEnabled, mediaState.desiredMicrophoneEnabled, mediaState.stream, room, syncPublishedTracks]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const handleConnected = () => {
      void syncPublishedTracks();
    };

    // Only listen to Connected/Reconnected for initial sync after (re)connection.
    // DO NOT listen to LocalTrackPublished/LocalTrackUnpublished here — those events
    // fire AFTER publishTrack() completes, creating a feedback loop:
    // syncPublishedTracks → publishTrack → LocalTrackPublished → syncPublishedTracks → ∞
    // State-driven sync (the effect above) already handles track changes correctly.
    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Reconnected, handleConnected);

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.Reconnected, handleConnected);
    };
  }, [room, syncPublishedTracks]);

  useEffect(() => {
    void ensureProcessedAudioTrack();
  }, [ensureProcessedAudioTrack, mediaState.stream]);

  /**
   * Phase 1 — Preview video track para el lobby.
   *
   * Cuando el usuario aún no está en una room (room === undefined), envuelve el
   * MediaStreamTrack de cámara en un LocalVideoTrack con userProvidedTrack=true
   * para que @livekit/track-processors pueda aplicar setProcessor() en el lobby.
   *
   * userProvidedTrack=true: LiveKit NO llamará track.stop() al limpiar,
   * preservando el ciclo de vida del stream original gestionado por SpaceMediaCoordinator.
   *
   * Una vez que el usuario entra en la room, getLocalVideoTrack() devuelve el
   * track publicado y este previewVideoTrack queda en null (liberado).
   */
  useEffect(() => {
    // Solo se necesita el preview track cuando no hay room conectada
    if (room) {
      setPreviewVideoTrack((prev) => {
        if (prev) {
          void prev.stopProcessor();
        }
        return null;
      });
      return;
    }

    const rawVideoTrack = mediaState.stream
      ?.getVideoTracks()
      .find((t) => t.readyState === 'live') ?? null;

    setPreviewVideoTrack((prev) => {
      if (!rawVideoTrack) {
        if (prev) { void prev.stopProcessor(); }
        return null;
      }

      // Reutilizar si ya wrapeamos este mismo track
      if (prev?.mediaStreamTrack.id === rawVideoTrack.id) {
        return prev;
      }

      // Limpiar wrapper anterior antes de crear uno nuevo.
      // Nota: la factory cachea por rawTrack.id, así que si rawVideoTrack
      // es el mismo track, wrapRawTrack() retornará el wrapper existente
      // sin crear uno nuevo — garantizando referencia estable.
      if (prev && prev.mediaStreamTrack.id !== rawVideoTrack.id) {
        void prev.stopProcessor();
      }

      // Delegar la creación/caché del wrapper a la factory de infraestructura.
      // Esto extrae la lógica de instanciación de LiveKit de la capa de Presentación
      // y centraliza la política userProvidedTrack=true en un solo lugar.
      return getLocalVideoTrackFactory().wrapRawTrack(rawVideoTrack);
    });
  }, [mediaState.stream, room]);

  const toggleCamera = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return false;
    }

    const nextEnabled = !coordinator.getState().desiredCameraEnabled;
    const result = await coordinator.toggleCamera(nextEnabled);

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

  const stopMediaCapture = useCallback(() => {
    cleanupProcessedAudio();
    // Limpiar el processor del previewVideoTrack antes de parar el stream
    setPreviewVideoTrack((prev) => {
      if (prev) { void prev.stopProcessor(); }
      return null;
    });
    coordinatorRef.current?.stopMedia();
  }, [cleanupProcessedAudio]);

  /**
   * Devuelve el LocalVideoTrack de preview para usar en el lobby.
   * Disponible ANTES de conectarse a la room.
   * Permite que VideoWithBackground use el path nativo (setProcessor) sin room.
   */
  const getPreviewVideoTrack = useCallback((): LocalVideoTrack | null => {
    return previewVideoTrack;
  }, [previewVideoTrack]);

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND PROCESSOR LIFECYCLE — Application layer (Clean Architecture)
  //
  // El processor vive en el bridge, NO en el componente de presentación.
  // Ciclo de vida:
  //   1. Track disponible (publicado o preview) → attachToTrack() [una vez]
  //   2. Camera ON  + effect ≠ none → setEffect(blur|image)
  //   3. Camera OFF ó effect = none → disableEffect() [processor vivo, passthrough]
  //   4. Unmount real (salir de reunión) → detachFromTrack() [libera WASM]
  //
  // Esto elimina el problema de mount/unmount de VideoWithBackground que
  // destruía y recreaba el WASM en cada toggle de cámara.
  // ═══════════════════════════════════════════════════════════════════════════

  const backgroundUseCaseRef = useRef<GestionarBackgroundVideoUseCase | null>(null);
  if (!backgroundUseCaseRef.current) {
    backgroundUseCaseRef.current = new GestionarBackgroundVideoUseCase(getLiveKitBackgroundAdapter());
  }

  /** Ref al último LocalVideoTrack sobre el que se hizo attachProcessor */
  const attachedBgTrackRef = useRef<LocalVideoTrack | null>(null);

  /**
   * Deferred detach para el processor (React Strict Mode safe).
   * Mismo patrón que deferredMediaCleanupRef: el cleanup programa un
   * detachFromTrack() vía setTimeout(0). Si hay remount, mount#2 lo cancela.
   */
  const deferredBgDetachRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Resolve el LocalVideoTrack activo: el publicado en room tiene prioridad,
   * fallback al preview track del lobby.
   */
  const resolveActiveVideoTrack = useCallback((): LocalVideoTrack | null => {
    // Track publicado en la room (ya gestionado por LiveKit)
    if (room) {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const published = (publication?.track as LocalVideoTrack | undefined) ?? null;
      if (published) return published;
    }
    // Preview track del lobby (wrapper con userProvidedTrack=true)
    return previewVideoTrack;
  }, [room, previewVideoTrack]);

  useEffect(() => {
    const useCase = backgroundUseCaseRef.current;
    if (!useCase) return;

    // ── Cancelar deferred detach de cleanup anterior (Strict Mode safe) ──
    if (deferredBgDetachRef.current !== null) {
      clearTimeout(deferredBgDetachRef.current);
      deferredBgDetachRef.current = null;
      log.info('[Bridge:BG] deferred detach cancelado → Strict Mode remount');
    }

    const track = resolveActiveVideoTrack();
    const wantEffect = cameraSettings.backgroundEffect !== 'none'
      && mediaState.desiredCameraEnabled;

    let cancelled = false;

    void (async () => {
      try {
        if (!track) {
          // Sin track: nada que hacer. Si había uno attached, el deferred
          // detach del cleanup anterior se encargará.
          return;
        }

        // ── Attach idempotente al track actual ────────────────────────────
        if (attachedBgTrackRef.current !== track) {
          // Si había un track diferente attached, detach primero
          if (attachedBgTrackRef.current) {
            await useCase.detachFromTrack(attachedBgTrackRef.current);
          }
          await useCase.attachToTrack(track);
          if (cancelled) return;
          attachedBgTrackRef.current = track;
          log.info('[Bridge:BG] processor attached', {
            trackId: track.sid ?? track.mediaStreamTrack.id,
          });
        }

        // ── Aplicar o desactivar efecto ───────────────────────────────────
        if (cancelled) return;

        if (wantEffect) {
          await useCase.setEffect(track, {
            effectType: cameraSettings.backgroundEffect,
            blurRadius: 12,
            backgroundImageUrl: cameraSettings.backgroundImage ?? undefined,
          });
          if (!cancelled) {
            log.info('[Bridge:BG] effect applied', {
              effectType: cameraSettings.backgroundEffect,
            });
          }
        } else {
          await useCase.disableEffect(track);
          if (!cancelled) {
            log.info('[Bridge:BG] effect disabled (passthrough)');
          }
        }
      } catch (err) {
        if (!cancelled) {
          log.error('[Bridge:BG] error en lifecycle', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      // Diferir detach al siguiente macrotask.
      // Si React Strict Mode hace remount, mount#2 cancela este timer.
      // En unmount real, el timer dispara y libera WASM/WebGL.
      const trackToDetach = attachedBgTrackRef.current;
      deferredBgDetachRef.current = setTimeout(() => {
        deferredBgDetachRef.current = null;
        if (trackToDetach) {
          log.info('[Bridge:BG] deferred detach ejecutado (unmount real)');
          void useCase.detachFromTrack(trackToDetach).catch(() => {});
          attachedBgTrackRef.current = null;
        }
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolveActiveVideoTrack,
    cameraSettings.backgroundEffect,
    cameraSettings.backgroundImage,
    mediaState.desiredCameraEnabled,
  ]);

  return {
    cameraSettings,
    audioSettings,
    mediaState,
    speakerDeviceId: audioSettings.selectedSpeakerId || undefined,
    /** true si el video local está siendo procesado con efectos de fondo */
    isLocalVideoProcessed: cameraSettings.backgroundEffect !== 'none'
      && mediaState.desiredCameraEnabled,
    updateCameraSettings,
    updateAudioSettings,
    toggleCamera,
    toggleMicrophone,
    stopMediaCapture,
    getPreviewVideoTrack,
  };
};
