/**
 * @module hooks/useLobbyState
 *
 * Hook de orquestación del lobby — Presentation layer.
 *
 * Responsabilidades:
 *   - Integra useMeetingMediaBridge (media capture + preview track)
 *   - Carga info de la sala desde Supabase vía ObtenerAccesoReunionUseCase
 *   - Delega cálculos de join-readiness a EvaluarEstadoLobbyUseCase (Application)
 *   - Expone estado derivado listo para renderizado, sin lógica en el componente
 *
 * Clean Architecture — Presentation solo consume Application y Domain.
 * MeetingLobby.tsx queda como componente puramente declarativo.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getMeetingJoinDefaults } from '@/lib/userSettings';
import { meetingAccessRepository } from '@/src/core/infrastructure/adapters/MeetingAccessSupabaseRepository';
import { ObtenerAccesoReunionUseCase } from '@/src/core/application/usecases/ObtenerAccesoReunionUseCase';
import { evaluarEstadoLobby } from '@/src/core/application/usecases/EvaluarEstadoLobbyUseCase';
import {
  Gatekeeper,
  PreflightSessionStore,
  getPreflightFeedback,
  defaultAudioSettings,
  defaultCameraSettings,
} from '@/modules/realtime-room';
import type { PreflightCheck } from '@/modules/realtime-room';
import { detectBrowserInfo } from '@/modules/realtime-room';
import type { PreferenciasIngresoReunion } from '@/hooks/app/useRutasReunion';
import { useMeetingMediaBridge } from './useMeetingMediaBridge';
import type { SalaInfo } from '@/src/core/domain/entities/lobby';

const obtenerAcceso = new ObtenerAccesoReunionUseCase(meetingAccessRepository);

interface UseLobbyStateParams {
  codigoSala?: string;
  tokenInvitacion?: string;
  onJoin: (token: string, nombre: string, preferencias?: PreferenciasIngresoReunion) => void;
  onError?: (error: string) => void;
}

export const useLobbyState = ({
  codigoSala,
  tokenInvitacion,
  onJoin,
  onError,
}: UseLobbyStateParams) => {
  const preferenciasIngreso = getMeetingJoinDefaults();

  // ── Estado local ──────────────────────────────────────────────────────────
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [salaInfo, setSalaInfo] = useState<SalaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightCheck>({
    camera: 'unknown',
    microphone: 'unknown',
    hasCameraDevice: false,
    hasMicrophoneDevice: false,
    cameraTrackReady: false,
    microphoneTrackReady: false,
    errors: [],
    ready: false,
  });

  const [browserInfo] = useState(() => detectBrowserInfo());

  // ── Refs de preflight ─────────────────────────────────────────────────────
  const gatekeeperRef = useRef<Gatekeeper | null>(null);
  const preflightStoreRef = useRef<PreflightSessionStore | null>(null);
  const syncPreflightRef = useRef<
    ((overrides?: { wantAudio?: boolean; wantVideo?: boolean }) => Promise<{
      canJoin: boolean;
      errors: PreflightCheck['errors'];
      state: PreflightCheck;
    }>) | null
  >(null);

  if (!gatekeeperRef.current) {
    gatekeeperRef.current = new Gatekeeper({ requireAudio: false, requireVideo: false });
  }
  if (!preflightStoreRef.current) {
    preflightStoreRef.current = new PreflightSessionStore();
  }

  // ── Media bridge ──────────────────────────────────────────────────────────
  const mediaBridge = useMeetingMediaBridge({
    initialCameraEnabled: !preferenciasIngreso.cameraOffOnJoin,
    initialMicrophoneEnabled: !preferenciasIngreso.muteOnJoin,
  });

  const {
    audioSettings,
    cameraSettings,
    mediaState,
    updateAudioSettings,
    updateCameraSettings,
    toggleCamera,
    toggleMicrophone,
    stopMediaCapture,
    getPreviewVideoTrack,
  } = mediaBridge;

  const cameraEnabled = mediaState.desiredCameraEnabled;
  const micEnabled = mediaState.desiredMicrophoneEnabled;
  const stream = mediaState.stream;

  // Stable preview track reference — evita re-renders al togglear mic
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localVideoTrackForBg = useMemo(() => getPreviewVideoTrack(), [getPreviewVideoTrack]);

  // ── Cálculos de join-readiness (delegados al Application Use Case) ────────
  const resolvedMedia = useMemo(
    () => evaluarEstadoLobby.resolveMediaStatus(preflight, { cameraEnabled, microphoneEnabled: micEnabled }),
    [preflight, cameraEnabled, micEnabled],
  );

  const joinMediaSummary = useMemo(
    () => evaluarEstadoLobby.summarizeJoinMedia(
      { cameraEnabled, microphoneEnabled: micEnabled },
      resolvedMedia,
      preflight,
    ),
    [preflight, cameraEnabled, micEnabled, resolvedMedia],
  );

  const statusIndicator = useMemo(
    () => evaluarEstadoLobby.getStatusIndicator({
      hasError: Boolean(error),
      hasPartialFallback: joinMediaSummary.hasPartialFallback,
      hasNoMediaFallback: joinMediaSummary.hasNoMediaFallback,
      preflightReady: preflight.ready,
    }),
    [error, joinMediaSummary, preflight.ready],
  );

  const joinButtonLabel = useMemo(
    () => evaluarEstadoLobby.getJoinButtonLabel(joinMediaSummary),
    [joinMediaSummary],
  );

  const preflightFeedback = useMemo(() => {
    const base = getPreflightFeedback(preflight.errors);
    if (joinMediaSummary.hasPartialFallback && joinMediaSummary.unavailableLabel) {
      return {
        title: 'Media parcial disponible',
        message: `No pudimos preparar ${joinMediaSummary.unavailableLabel}, pero puedes continuar con ${joinMediaSummary.availableLabel}.`,
        variant: 'warning' as const,
        steps: [
          `Entra a la sala con ${joinMediaSummary.availableLabel}.`,
          'Dentro de la reunión podrás volver a intentar activar el dispositivo faltante.',
        ],
        ctaLabel: `Entrar con ${joinMediaSummary.availableLabel}`,
      };
    }
    return base;
  }, [preflight.errors, joinMediaSummary]);

  // ── Sync Preflight ────────────────────────────────────────────────────────
  const syncPreflight = useCallback(
    async (overrides?: { wantAudio?: boolean; wantVideo?: boolean }) => {
      const gatekeeper = gatekeeperRef.current;
      const store = preflightStoreRef.current;
      if (!gatekeeper || !store) {
        return { canJoin: true, errors: [] as PreflightCheck['errors'], state: preflight };
      }

      const wantAudio = overrides?.wantAudio ?? micEnabled;
      const wantVideo = overrides?.wantVideo ?? cameraEnabled;
      const snapshot = mediaState.preflightCheck;

      store.reset();
      store.updatePermission('camera', snapshot.camera);
      store.updatePermission('microphone', snapshot.microphone);
      store.updateDeviceAvailability('camera', snapshot.hasCameraDevice);
      store.updateDeviceAvailability('microphone', snapshot.hasMicrophoneDevice);
      store.updateTrackReady('camera', wantVideo ? snapshot.cameraTrackReady : false);
      store.updateTrackReady('microphone', wantAudio ? snapshot.microphoneTrackReady : false);

      gatekeeper.updateOptions({ requireAudio: wantAudio, requireVideo: wantVideo });

      const baseState = store.getState();
      const validation = gatekeeper.validate(baseState);
      const nextState = { ...baseState, errors: validation.errors, ready: validation.canJoin };

      setPreflight(nextState);
      return { canJoin: validation.canJoin, errors: validation.errors, state: nextState };
    },
    [micEnabled, cameraEnabled, mediaState.preflightCheck, preflight],
  );

  syncPreflightRef.current = syncPreflight;

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    void syncPreflight({ wantAudio: micEnabled, wantVideo: cameraEnabled });
  }, [cameraEnabled, micEnabled, mediaState.preflightCheck, stream]);

  useEffect(() => {
    return () => { stopMediaCapture(); };
  }, [stopMediaCapture]);

  useEffect(() => {
    let isCancelled = false;

    const fetchSalaInfo = async () => {
      try {
        setLoading(true);

        if (tokenInvitacion) {
          const invData = await obtenerAcceso.validarInvitacion(tokenInvitacion);
          if (isCancelled) return;
          if (!invData.sala) throw new Error('Invitación no válida o expirada');

          setNombre(invData.nombre || '');
          setEmail(invData.email || '');
          setSalaInfo({
            nombre: invData.sala.nombre || 'Reunión',
            tipo: (invData.sala.tipo as SalaInfo['tipo']) || 'general',
            organizador: invData.organizador_nombre || 'Organizador',
            configuracion: (invData.sala.configuracion as SalaInfo['configuracion']) || { sala_espera: true },
          });
        } else if (codigoSala) {
          const sala = await obtenerAcceso.obtenerSalaPorCodigo(codigoSala);
          if (isCancelled) return;
          if (!sala) throw new Error('Código de sala no válido');

          const organizador = sala.creador_id
            ? await obtenerAcceso.obtenerNombreCreador(sala.creador_id)
            : 'Organizador';

          setSalaInfo({
            nombre: sala.nombre || 'Reunión',
            tipo: (sala.tipo as SalaInfo['tipo']) || 'general',
            organizador,
            configuracion: (sala.configuracion as SalaInfo['configuracion']) || { sala_espera: true },
          });
        }
      } catch (err) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Error desconocido al cargar la sala';
          setError(message);
          onError?.(message);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    void fetchSalaInfo();
    return () => { isCancelled = true; };
  }, [codigoSala, tokenInvitacion]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleCamera = useCallback(() => { void toggleCamera(); }, [toggleCamera]);
  const handleToggleMic = useCallback(() => { void toggleMicrophone(); }, [toggleMicrophone]);

  const handleAudioSettingsChange = useCallback(
    (partial: Partial<typeof defaultAudioSettings>) => { void updateAudioSettings(partial); },
    [updateAudioSettings],
  );

  const handleCameraSettingsChange = useCallback(
    (partial: Partial<typeof defaultCameraSettings>) => { void updateCameraSettings(partial); },
    [updateCameraSettings],
  );

  const handleJoin = useCallback(async () => {
    if (!nombre.trim()) {
      setError('Por favor ingresa tu nombre');
      return;
    }
    try {
      setJoining(true);
      setError(null);

      const validation = await syncPreflight({ wantAudio: micEnabled, wantVideo: cameraEnabled });
      const resolvedValidation = evaluarEstadoLobby.resolveMediaStatus(validation.state, {
        cameraEnabled,
        microphoneEnabled: micEnabled,
      });

      const joinPreferences = validation.canJoin
        ? { microfonoActivo: micEnabled, camaraActiva: cameraEnabled }
        : { microfonoActivo: resolvedValidation.microphoneActive, camaraActiva: resolvedValidation.cameraActive };

      const hadActivePreview = Boolean(stream?.getTracks().some((t) => t.readyState === 'live'));
      stopMediaCapture();
      await new Promise((resolve) => window.setTimeout(resolve, hadActivePreview ? 450 : 120));

      onJoin(tokenInvitacion || codigoSala || '', nombre.trim(), {
        microfonoActivo: joinPreferences.microfonoActivo,
        camaraActiva: joinPreferences.camaraActiva,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      setJoining(false);
    }
  }, [nombre, syncPreflight, micEnabled, cameraEnabled, stream, stopMediaCapture, onJoin, tokenInvitacion, codigoSala]);

  // ─── Return ───────────────────────────────────────────────────────────────
  return {
    // Sala
    salaInfo,
    loading,
    joining,
    error,
    // Media
    cameraEnabled,
    micEnabled,
    stream,
    audioSettings,
    cameraSettings,
    localVideoTrackForBg,
    // Preflight / join readiness
    preflight,
    resolvedMedia,
    joinMediaSummary,
    statusIndicator,
    joinButtonLabel,
    preflightFeedback,
    // Formulario
    nombre,
    setNombre,
    email,
    setEmail,
    // Browser
    browserInfo,
    // Handlers
    handleToggleCamera,
    handleToggleMic,
    handleAudioSettingsChange,
    handleCameraSettingsChange,
    handleJoin,
  };
};
