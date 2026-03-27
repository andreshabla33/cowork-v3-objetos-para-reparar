'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VideoWithBackground } from '@/components/VideoWithBackground';
import {
  SharedAudioDeviceControl,
  SharedCameraDeviceControl,
} from '@/components/media/SharedMediaDeviceControls';
import { supabase } from '@/lib/supabase';
import { getMeetingJoinDefaults } from '@/lib/userSettings';
import type { PreferenciasIngresoReunion } from '@/hooks/app/useRutasReunion';
import {
  Gatekeeper,
  PreflightSessionStore,
  defaultAudioSettings,
  defaultCameraSettings,
  getPreflightFeedback,
} from '@/modules/realtime-room';
import type { PreflightCheck } from '@/modules/realtime-room';
import { useMeetingMediaBridge } from './hooks/useMeetingMediaBridge';

interface MeetingLobbyProps {
  codigoSala?: string;
  tokenInvitacion?: string;
  onJoin: (token: string, nombre: string, preferencias?: PreferenciasIngresoReunion) => void;
  onError?: (error: string) => void;
}

interface SalaInfo {
  nombre: string;
  tipo: string;
  organizador: string;
  configuracion: {
    sala_espera: boolean;
  };
}

const resolveJoinMediaAvailability = (
  preflight: PreflightCheck,
  desired: { cameraEnabled: boolean; microphoneEnabled: boolean }
) => {
  const cameraActive = desired.cameraEnabled
    && preflight.camera !== 'denied'
    && preflight.hasCameraDevice
    && preflight.cameraTrackReady;

  const microphoneActive = desired.microphoneEnabled
    && preflight.microphone !== 'denied'
    && preflight.hasMicrophoneDevice
    && preflight.microphoneTrackReady;

  return {
    cameraActive,
    microphoneActive,
  };
};

const getAvailableMediaLabel = ({ cameraActive, microphoneActive }: { cameraActive: boolean; microphoneActive: boolean }) => {
  if (cameraActive && microphoneActive) return 'cámara y micrófono';
  if (cameraActive) return 'cámara';
  if (microphoneActive) return 'micrófono';
  return 'sin cámara ni micrófono';
};

const getUnavailableMediaLabel = (
  desired: { cameraEnabled: boolean; microphoneEnabled: boolean },
  resolved: { cameraActive: boolean; microphoneActive: boolean }
) => {
  const cameraUnavailable = desired.cameraEnabled && !resolved.cameraActive;
  const microphoneUnavailable = desired.microphoneEnabled && !resolved.microphoneActive;

  if (cameraUnavailable && microphoneUnavailable) return 'la cámara y el micrófono';
  if (cameraUnavailable) return 'la cámara';
  if (microphoneUnavailable) return 'el micrófono';
  return null;
};

const getJoinStatusTone = (options: {
  hasError: boolean;
  partialFallback: boolean;
  noMediaFallback: boolean;
  ready: boolean;
}) => {
  if (options.hasError) {
    return {
      pillClass: 'border-red-500/30 bg-red-500/12 text-red-200',
      dotClass: 'bg-red-400',
      label: 'Requiere atención',
    };
  }

  if (options.partialFallback || options.noMediaFallback) {
    return {
      pillClass: 'border-amber-500/30 bg-amber-500/12 text-amber-200',
      dotClass: 'bg-amber-400',
      label: 'Listo con limitaciones',
    };
  }

  if (options.ready) {
    return {
      pillClass: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200',
      dotClass: 'bg-emerald-400',
      label: 'Listo para entrar',
    };
  }

  return {
    pillClass: 'border-white/10 bg-white/5 text-zinc-200',
    dotClass: 'bg-zinc-400',
    label: 'Preparando dispositivos',
  };
};

export const MeetingLobby: React.FC<MeetingLobbyProps> = ({
  codigoSala,
  tokenInvitacion,
  onJoin,
  onError,
}) => {
  const preferenciasIngreso = getMeetingJoinDefaults();
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const gatekeeperRef = useRef<Gatekeeper | null>(null);
  const preflightStoreRef = useRef<PreflightSessionStore | null>(null);
  const syncPreflightRef = useRef<((overrides?: { wantAudio?: boolean; wantVideo?: boolean }) => Promise<{ canJoin: boolean; errors: PreflightCheck['errors']; state: PreflightCheck }>) | null>(null);

  if (!gatekeeperRef.current) {
    gatekeeperRef.current = new Gatekeeper({
      requireAudio: false,
      requireVideo: false,
    });
  }

  if (!preflightStoreRef.current) {
    preflightStoreRef.current = new PreflightSessionStore();
  }

  const {
    audioSettings,
    cameraSettings,
    mediaState,
    updateAudioSettings,
    updateCameraSettings,
    toggleCamera,
    toggleMicrophone,
    setProcessedStream,
    stopMediaCapture,
  } = useMeetingMediaBridge({
    initialCameraEnabled: !preferenciasIngreso.cameraOffOnJoin,
    initialMicrophoneEnabled: !preferenciasIngreso.muteOnJoin,
  });
  const cameraEnabled = mediaState.desiredCameraEnabled;
  const micEnabled = mediaState.desiredMicrophoneEnabled;
  const stream = mediaState.stream;

  const preflightFeedback = getPreflightFeedback(preflight.errors);
  const resolvedJoinMedia = resolveJoinMediaAvailability(preflight, {
    cameraEnabled,
    microphoneEnabled: micEnabled,
  });
  const availableMediaLabel = getAvailableMediaLabel(resolvedJoinMedia);
  const unavailableMediaLabel = getUnavailableMediaLabel(
    { cameraEnabled, microphoneEnabled: micEnabled },
    resolvedJoinMedia,
  );
  const partialJoinFallback = Boolean(
    !preflight.ready
    && (resolvedJoinMedia.cameraActive || resolvedJoinMedia.microphoneActive)
    && unavailableMediaLabel
  );
  const joinWithoutMediaFallback = Boolean(
    (cameraEnabled || micEnabled)
    && !preflight.ready
    && !resolvedJoinMedia.cameraActive
    && !resolvedJoinMedia.microphoneActive
    && preflight.errors.length > 0
  );
  const effectivePreflightFeedback = partialJoinFallback && unavailableMediaLabel
    ? {
        title: 'Media parcial disponible',
        message: `No pudimos preparar ${unavailableMediaLabel}, pero puedes continuar con ${availableMediaLabel}.`,
        variant: 'warning' as const,
        steps: [
          `Entra a la sala con ${availableMediaLabel}.`,
          'Dentro de la reunión podrás volver a intentar activar el dispositivo faltante.',
        ],
        ctaLabel: `Entrar con ${availableMediaLabel}`,
      }
    : preflightFeedback;
  const joinButtonLabel = partialJoinFallback
    ? `Entrar con ${availableMediaLabel}`
    : joinWithoutMediaFallback
      ? 'Entrar sin cámara ni micrófono'
      : 'Unirse a la reunión';
  const joinStatusTone = getJoinStatusTone({
    hasError: Boolean(error),
    partialFallback: partialJoinFallback,
    noMediaFallback: joinWithoutMediaFallback,
    ready: preflight.ready,
  });
  const tipoInfo = getTipoInfo(salaInfo?.tipo || 'general');
  const previewStatusLabel = cameraEnabled && !cameraSettings.hideSelfView
    ? cameraSettings.backgroundEffect === 'none'
      ? 'Vista previa activa'
      : 'Vista previa con efectos'
    : 'Vista previa oculta';
  const roomMeta = [
    {
      label: 'Formato',
      value: tipoInfo.label,
    },
    {
      label: 'Acceso',
      value: salaInfo?.configuracion.sala_espera ? 'Sala de espera' : 'Ingreso directo',
    },
    {
      label: 'Audio y video',
      value: availableMediaLabel,
    },
  ];

  const syncPreflight = async (overrides?: { wantAudio?: boolean; wantVideo?: boolean }) => {
    const gatekeeper = gatekeeperRef.current;
    const preflightStore = preflightStoreRef.current;
    if (!gatekeeper || !preflightStore) {
      return { canJoin: true, errors: [] as PreflightCheck['errors'], state: preflight };
    }

    const wantAudio = overrides?.wantAudio ?? micEnabled;
    const wantVideo = overrides?.wantVideo ?? cameraEnabled;
    const snapshot = mediaState.preflightCheck;

    preflightStore.reset();
    preflightStore.updatePermission('camera', snapshot.camera);
    preflightStore.updatePermission('microphone', snapshot.microphone);
    preflightStore.updateDeviceAvailability('camera', snapshot.hasCameraDevice);
    preflightStore.updateDeviceAvailability('microphone', snapshot.hasMicrophoneDevice);
    preflightStore.updateTrackReady('camera', wantVideo ? snapshot.cameraTrackReady : false);
    preflightStore.updateTrackReady('microphone', wantAudio ? snapshot.microphoneTrackReady : false);

    gatekeeper.updateOptions({
      requireAudio: wantAudio,
      requireVideo: wantVideo,
    });

    const baseState = preflightStore.getState();
    const validation = gatekeeper.validate(baseState);
    const nextState = {
      ...baseState,
      errors: validation.errors,
      ready: validation.canJoin,
    };

    setPreflight(nextState);
    return { canJoin: validation.canJoin, errors: validation.errors, state: nextState };
  };
  syncPreflightRef.current = syncPreflight;

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    if (stream && cameraEnabled) {
      videoRef.current.srcObject = stream;
      return;
    }

    videoRef.current.pause();
    videoRef.current.srcObject = null;
  }, [cameraEnabled, stream]);

  useEffect(() => {
    void syncPreflight({ wantAudio: micEnabled, wantVideo: cameraEnabled });
  }, [cameraEnabled, micEnabled, mediaState.preflightCheck, stream]);

  useEffect(() => {
    return () => {
      stopMediaCapture();
    };
  }, [stopMediaCapture]);

  // Cargar información de la sala
  useEffect(() => {
    console.log('[MeetingLobby] fetchSalaInfo iniciando', { codigoSala, tokenInvitacion: tokenInvitacion?.slice(0, 8) + '...' });
    let isCancelled = false;
    
    const fetchSalaInfo = async () => {
      try {
        setLoading(true);
        
        if (tokenInvitacion) {
          console.log('[MeetingLobby] Validando invitación...');
          const { data, error: fnError } = await supabase.functions.invoke('validar-invitacion-reunion', {
            body: { token: tokenInvitacion }
          });

          if (isCancelled) {
            console.log('[MeetingLobby] Fetch cancelado (componente desmontado)');
            return;
          }

          if (fnError) {
            console.error('[MeetingLobby] Error validando invitación:', fnError);
            throw new Error(fnError.message || 'Invitación no válida o expirada');
          }

          if (data?.error) {
            throw new Error(data.error);
          }

          const invitacion = data?.invitacion;
          const salaData = invitacion?.sala as any;

          if (!salaData) {
            throw new Error('Invitación no válida o expirada');
          }

          setNombre(invitacion?.nombre || '');
          setEmail(invitacion?.email || '');

          setSalaInfo({
            nombre: salaData?.nombre || 'Reunión',
            tipo: salaData?.tipo || 'general',
            organizador: data?.organizador_nombre || 'Organizador',
            configuracion: salaData?.configuracion || { sala_espera: true },
          });
          console.log('[MeetingLobby] Sala cargada exitosamente:', salaData?.nombre);
        } else if (codigoSala) {
          console.log('[MeetingLobby] Buscando sala por código...');
          // ... resto del código
          const { data: sala, error: salaError } = await supabase
            .from('salas_reunion')
            .select(`
              nombre,
              tipo,
              configuracion,
              creador_id
            `)
            .eq('codigo_acceso', codigoSala)
            .eq('activa', true)
            .single();

          if (isCancelled) return;

          if (salaError || !sala) {
            throw new Error('Código de sala no válido');
          }

          const salaTyped = sala as any;
          
          let organizadorNombre = 'Organizador';
          if (salaTyped.creador_id) {
            const { data: creador } = await supabase
              .from('usuarios')
              .select('nombre')
              .eq('id', salaTyped.creador_id)
              .single();
            organizadorNombre = creador?.nombre || 'Organizador';
          }
          
          setSalaInfo({
            nombre: salaTyped.nombre || 'Reunión',
            tipo: salaTyped.tipo || 'general',
            organizador: organizadorNombre,
            configuracion: salaTyped.configuracion || { sala_espera: true },
          });
          console.log('[MeetingLobby] Sala cargada por código:', salaTyped.nombre);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[MeetingLobby] Error en fetchSalaInfo:', err);
          setError(err.message);
          onError?.(err.message);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchSalaInfo();
    
    return () => {
      isCancelled = true;
    };
  }, [codigoSala, tokenInvitacion]); // Eliminado onError de dependencias

  // Toggle cámara
  const handleToggleCamera = () => {
    void toggleCamera();
  };

  // Toggle micrófono
  const handleToggleMic = () => {
    void toggleMicrophone();
  };

  const handleAudioSettingsChange = (partial: Partial<typeof defaultAudioSettings>) => {
    void updateAudioSettings(partial);
  };

  const handleCameraSettingsChange = (partial: Partial<typeof defaultCameraSettings>) => {
    void updateCameraSettings(partial);
  };

  // Unirse a la reunión
  const handleJoin = async () => {
    if (!nombre.trim()) {
      setError('Por favor ingresa tu nombre');
      return;
    }

    try {
      setJoining(true);
      setError(null);

      const validation = await syncPreflight({
        wantAudio: micEnabled,
        wantVideo: cameraEnabled,
      });
      const resolvedValidationMedia = resolveJoinMediaAvailability(validation.state, {
        cameraEnabled,
        microphoneEnabled: micEnabled,
      });
      const joinPreferences = validation.canJoin
        ? {
            microfonoActivo: micEnabled,
            camaraActiva: cameraEnabled,
          }
        : {
            microfonoActivo: resolvedValidationMedia.microphoneActive,
            camaraActiva: resolvedValidationMedia.cameraActive,
          };

      const hadActivePreview = Boolean(stream?.getTracks().some((track) => track.readyState === 'live'));
      stopMediaCapture();
      await new Promise((resolve) => window.setTimeout(resolve, hadActivePreview ? 450 : 120));

      onJoin(tokenInvitacion || codigoSala || '', nombre.trim(), {
        microfonoActivo: joinPreferences.microfonoActivo,
        camaraActiva: joinPreferences.camaraActiva,
      });
    } catch (err: any) {
      setError(err.message);
      setJoining(false);
    }
  };

  // Obtener icono y color según tipo de reunión
  function getTipoInfo(tipo: string) {
    switch (tipo) {
      case 'deal':
        return { icon: '💼', label: 'Reunión de Negocios', color: 'from-emerald-500 to-teal-600' };
      case 'entrevista':
        return { icon: '👥', label: 'Entrevista', color: 'from-blue-500 to-indigo-600' };
      default:
        return { icon: '🎥', label: 'Videollamada', color: 'from-indigo-500 to-purple-600' };
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050508] p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-30%] left-[-20%] h-[70%] w-[70%] rounded-full bg-violet-600/15 blur-[180px] animate-pulse" />
          <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        </div>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Cargando información de la reunión...</p>
        </div>
      </div>
    );
  }

  if (error && !salaInfo) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050508] p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-30%] left-[-20%] h-[70%] w-[70%] rounded-full bg-violet-600/15 blur-[180px] animate-pulse" />
          <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        </div>
        <div className="relative max-w-md rounded-[36px] border border-white/[0.08] bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No se puede acceder</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <a 
            href="/"
            className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition-all"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#050508] p-4 lg:p-3">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-20%] h-[70%] w-[70%] rounded-full bg-violet-600/15 blur-[180px] animate-pulse" />
        <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] left-[50%] h-[40%] w-[40%] rounded-full bg-fuchsia-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[1400px] items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="relative w-full">
          <div className="absolute -inset-1 rounded-[32px] sm:rounded-[40px] bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 blur-xl opacity-60" />
          <div className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col lg:grid lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_420px] min-h-[calc(100dvh-80px)] lg:min-h-[min(90dvh,800px)] lg:max-h-[min(90dvh,800px)]">
            {/* Preview de cámara */}
            <div className="relative flex-shrink-0 h-[45dvh] min-h-[280px] max-h-[400px] sm:h-[50dvh] sm:min-h-[320px] sm:max-h-[480px] lg:h-auto lg:min-h-0 lg:max-h-none border-b border-white/5 lg:border-b-0 lg:border-r lg:border-white/5">
              <div className="absolute inset-0 overflow-hidden rounded-t-[24px] sm:rounded-t-[32px] lg:rounded-l-[32px] lg:rounded-tr-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_45%)]" />
              {cameraEnabled && !cameraSettings.hideSelfView && stream && stream.getVideoTracks().length > 0 && cameraSettings.backgroundEffect !== 'none' && (
                <VideoWithBackground
                  stream={stream}
                  effectType={cameraSettings.backgroundEffect}
                  backgroundImage={cameraSettings.backgroundImage}
                  blurAmount={12}
                  muted={true}
                  className="w-full h-full object-cover"
                  onProcessedStreamReady={setProcessedStream}
                  mirrorVideo={cameraSettings.mirrorVideo}
                />
              )}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!cameraEnabled || cameraSettings.hideSelfView || cameraSettings.backgroundEffect !== 'none' ? 'hidden' : ''} ${cameraSettings.mirrorVideo ? 'mirror' : ''}`}
              />

              {joining && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3 text-white">
                    <div className="w-10 h-10 border-4 border-white/80 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium text-white/80">Preparando cámara...</span>
                  </div>
                </div>
              )}
              
              {(!cameraEnabled || cameraSettings.hideSelfView) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 shadow-2xl shadow-violet-600/30 sm:h-28 sm:w-28">
                    <span className="text-3xl font-black text-white sm:text-4xl">
                      {nombre ? nombre.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                </div>
              )}

              <div className="absolute left-2 right-2 top-2 z-20 sm:left-3 sm:right-3 sm:top-3 lg:left-4 lg:right-4 lg:top-4">
                <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-[20rem] sm:max-w-[22rem] lg:max-w-[24rem] rounded-xl sm:rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-xl">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-[0.22em] text-zinc-400">
                      Vista previa
                    </p>
                    <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white lg:text-base leading-tight">
                      Revisa cámara, micrófono y efectos antes de entrar
                    </p>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs leading-relaxed text-zinc-400 sm:text-sm hidden sm:block">
                      {previewStatusLabel}. Los cambios se aplican con los mismos controles de la reunión.
                    </p>
                  </div>

                  <div className={`inline-flex items-center gap-1.5 sm:gap-2 self-start rounded-full border px-2.5 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.18em] shadow-lg backdrop-blur-xl ${joinStatusTone.pillClass}`}>
                    <span className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full ${joinStatusTone.dotClass}`} />
                    <span className="whitespace-nowrap">{joinStatusTone.label}</span>
                  </div>
                </div>
              </div>
              </div>

              <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-3 sm:bottom-3 lg:inset-x-4 lg:bottom-4">
                <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-black/35 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 lg:gap-3 lg:justify-start">
                  <SharedAudioDeviceControl
                    isEnabled={micEnabled}
                    settings={audioSettings ?? defaultAudioSettings}
                    currentStream={stream}
                    onToggle={handleToggleMic}
                    onSettingsChange={handleAudioSettingsChange}
                    dataTourStep="lobby-mic-group"
                    showMenuToggle={true}
                  />
                  <SharedCameraDeviceControl
                    isEnabled={cameraEnabled}
                    settings={cameraSettings ?? defaultCameraSettings}
                    currentStream={stream}
                    onToggle={handleToggleCamera}
                    onSettingsChange={handleCameraSettingsChange}
                    dataTourStep="lobby-camera-group"
                    showMenuToggle={true}
                  />
                  <div className="hidden sm:block sm:flex-1 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.18em] text-zinc-400 sm:text-left lg:min-w-[140px]">
                    Ajusta tus dispositivos antes de entrar
                  </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Formulario */}
            <div className="flex flex-col justify-center bg-[rgba(23,23,42,0.55)] p-6 sm:p-7 lg:p-8 xl:p-10">
              {/* Info de la reunión */}
              <div className="mb-6 sm:mb-8">
                <div className={`mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r px-4 py-2 text-sm font-black text-white shadow-lg ${tipoInfo.color}`}>
                  <span>{tipoInfo.icon}</span>
                  <span>{tipoInfo.label}</span>
                </div>
                <h1 className="mb-3 text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white lg:text-4xl xl:text-[2.6rem]">
                  {salaInfo?.nombre}
                </h1>
                <p className="text-base text-zinc-400 lg:text-lg">
                  Organizado por <span className="font-black text-white">{salaInfo?.organizador}</span>
                </p>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:mb-8">
                {roomMeta.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 backdrop-blur-xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white leading-snug">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Formulario de ingreso */}
              <form className="space-y-4 lg:space-y-5" onSubmit={(event) => {
                event.preventDefault();
                void handleJoin();
              }}>
                <div>
                  <label htmlFor="meeting-lobby-name" className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                    Tu nombre *
                  </label>
                  <div className="relative group">
                    <input
                      id="meeting-lobby-name"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ingresa tu nombre"
                      autoComplete="name"
                      maxLength={80}
                      className="w-full rounded-xl border border-white/5 bg-black/40 px-4 py-3.5 text-sm text-white placeholder:text-zinc-700 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      disabled={joining}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Este nombre será visible para los demás participantes.
                  </p>
                </div>

                {!tokenInvitacion && (
                  <div>
                    <label htmlFor="meeting-lobby-email" className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Email (opcional)
                    </label>
                    <input
                      id="meeting-lobby-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      autoComplete="email"
                      className="w-full rounded-xl border border-white/5 bg-black/40 px-4 py-3.5 text-sm text-white placeholder:text-zinc-700 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      disabled={joining}
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Lo usaremos solo para identificarte mejor si la sala lo necesita.
                    </p>
                  </div>
                )}

                {error && (
                  <div aria-live="polite" className="rounded-xl border border-red-500/30 bg-red-500/20 p-3">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {!error && effectivePreflightFeedback && (
                  <div aria-live="polite" className={`rounded-xl border p-4 ${effectivePreflightFeedback.variant === 'error' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <p className={`text-sm font-semibold mb-1 ${effectivePreflightFeedback.variant === 'error' ? 'text-red-300' : 'text-amber-300'}`}>{effectivePreflightFeedback.title}</p>
                    <p className={`text-sm ${effectivePreflightFeedback.variant === 'error' ? 'text-red-400' : 'text-amber-400'}`}>{effectivePreflightFeedback.message}</p>
                    {effectivePreflightFeedback.steps.length > 0 && (
                      <ul className={`mt-3 space-y-1 text-xs ${effectivePreflightFeedback.variant === 'error' ? 'text-red-200/90' : 'text-amber-200/90'}`}>
                        {effectivePreflightFeedback.steps.map((step) => (
                          <li key={step} className="leading-relaxed">- {step}</li>
                        ))}
                      </ul>
                    )}
                    {effectivePreflightFeedback.ctaLabel && (
                      <p className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${effectivePreflightFeedback.variant === 'error' ? 'text-red-300' : 'text-amber-300'}`}>{effectivePreflightFeedback.ctaLabel}</p>
                    )}
                  </div>
                )}

                {salaInfo?.configuracion.sala_espera && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Esperarás a que el anfitrión te admita
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-white/8 bg-black/25 p-4 backdrop-blur-xl">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Qué pasará al entrar</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                        Entrarás con {availableMediaLabel}. Luego podrás volver a cambiar dispositivos, efectos y permisos desde la reunión.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={joining || !nombre.trim()}
                  className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 px-5 py-4 text-xs font-black uppercase tracking-[0.15em] text-white shadow-2xl shadow-violet-600/30 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 transition-opacity duration-300 hover:opacity-100" />
                  {joining ? (
                    <span className="relative flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Conectando...
                    </span>
                  ) : (
                    <span className="relative flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {joinButtonLabel}
                    </span>
                  )}
                </button>

                {partialJoinFallback && (
                  <p className="text-xs text-amber-300/90 text-center">
                    Puedes entrar ahora con {availableMediaLabel} y volver a intentar activar el otro dispositivo desde la sala.
                  </p>
                )}

                {joinWithoutMediaFallback && (
                  <p className="text-xs text-amber-300/90 text-center">
                    Puedes entrar ahora sin media y volver a intentar activar cámara o micrófono desde la sala.
                  </p>
                )}
              </form>

              {/* Footer */}
              <p className="mt-6 text-center text-xs font-bold leading-relaxed text-zinc-500 sm:mt-8">
                Al unirte aceptas compartir tu audio y video con los participantes
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingLobby;
