'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VideoWithBackground } from '@/components/VideoWithBackground';
import { supabase } from '@/lib/supabase';
import { getMeetingJoinDefaults } from '@/lib/userSettings';
import type { PreferenciasIngresoReunion } from '@/hooks/app/useRutasReunion';
import { Gatekeeper, PreflightSessionStore, getPreflightFeedback } from '@/modules/realtime-room';
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
    cameraSettings,
    mediaState,
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
    const fetchSalaInfo = async () => {
      try {
        setLoading(true);
        
        if (tokenInvitacion) {
          const { data, error: fnError } = await supabase.functions.invoke('validar-invitacion-reunion', {
            body: { token: tokenInvitacion }
          });

          if (fnError) {
            console.error('Error validando invitación:', fnError);
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
        } else if (codigoSala) {
          // Buscar por código de sala (query simplificada)
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

          if (salaError || !sala) {
            throw new Error('Código de sala no válido');
          }

          const salaTyped = sala as any;
          
          // Obtener nombre del creador por separado
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
        }
      } catch (err: any) {
        setError(err.message);
        onError?.(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSalaInfo();
  }, [codigoSala, tokenInvitacion, onError]);

  // Toggle cámara
  const handleToggleCamera = () => {
    void toggleCamera();
  };

  // Toggle micrófono
  const handleToggleMic = () => {
    void toggleMicrophone();
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
  const getTipoInfo = (tipo: string) => {
    switch (tipo) {
      case 'deal':
        return { icon: '💼', label: 'Reunión de Negocios', color: 'from-emerald-500 to-teal-600' };
      case 'entrevista':
        return { icon: '👥', label: 'Entrevista', color: 'from-blue-500 to-indigo-600' };
      default:
        return { icon: '🎥', label: 'Videollamada', color: 'from-indigo-500 to-purple-600' };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Cargando información de la reunión...</p>
        </div>
      </div>
    );
  }

  if (error && !salaInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-md text-center">
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

  const tipoInfo = getTipoInfo(salaInfo?.tipo || 'general');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-3 sm:p-4 lg:p-6">
      <div className="w-full max-w-6xl">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
          <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            {/* Preview de cámara */}
            <div className="relative aspect-[4/5] sm:aspect-video xl:aspect-auto min-h-[280px] sm:min-h-[360px] xl:min-h-[560px] bg-black/50">
              {cameraEnabled && !cameraSettings.hideSelfView && stream && stream.getVideoTracks().length > 0 && cameraSettings.backgroundEffect !== 'none' && (
                <VideoWithBackground
                  stream={stream}
                  effectType={cameraSettings.backgroundEffect}
                  backgroundImage={cameraSettings.backgroundImage}
                  blurAmount={12}
                  muted={true}
                  className="w-full h-full object-cover"
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
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-4xl font-bold text-white">
                      {nombre ? nombre.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                </div>
              )}

              {/* Controles de preview */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 sm:bottom-4">
                <button
                  onClick={handleToggleMic}
                  className={`p-2.5 sm:p-3 rounded-full transition-all ${
                    micEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {micEnabled ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    )}
                  </svg>
                </button>
                <button
                  onClick={handleToggleCamera}
                  className={`p-2.5 sm:p-3 rounded-full transition-all ${
                    cameraEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {cameraEnabled ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Formulario */}
            <div className="p-5 sm:p-6 lg:p-8">
              {/* Info de la reunión */}
              <div className="mb-6 sm:mb-8">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${tipoInfo.color} text-white text-sm font-medium mb-4`}>
                  <span>{tipoInfo.icon}</span>
                  <span>{tipoInfo.label}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  {salaInfo?.nombre}
                </h1>
                <p className="text-white/60">
                  Organizado por <span className="text-white font-medium">{salaInfo?.organizador}</span>
                </p>
              </div>

              {/* Formulario de ingreso */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                    Tu nombre *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ingresa tu nombre"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all"
                    disabled={joining}
                  />
                </div>

                {!tokenInvitacion && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                      Email (opcional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all"
                      disabled={joining}
                    />
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {!error && effectivePreflightFeedback && (
                  <div className={`p-4 rounded-xl border ${effectivePreflightFeedback.variant === 'error' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
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

                <button
                  onClick={handleJoin}
                  disabled={joining || !nombre.trim()}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2"
                >
                  {joining ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {joinButtonLabel}
                    </>
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
              </div>

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-white/40">
                Al unirte aceptas compartir tu audio y video con los participantes
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingLobby;
