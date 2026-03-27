import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { CONFIG_PUBLICA_APP } from '@/lib/env';
import { otorgarXP, XP_POR_ACCION } from '@/lib/gamificacion';
import { RealtimeSessionTelemetry } from '@/modules/realtime-room';
import type { CargoLaboral } from '../../recording/types/analysis';
import type { InvitadoExterno, TipoReunionUnificado } from '@/types/meeting-types';
import type { GuestPermissions, MeetingRecoveryState, MeetingRoomProps, TokenData } from '../meetingRoom.types';
import type { TipoReunion } from '../MeetingControlBar';

const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
const HEARTBEAT_INTERVAL_MS = 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const inFlightTokenRequests = new Map<string, Promise<{ status: number; statusText: string; text: string }>>();

export const useMeetingAccess = ({
  salaId,
  tokenInvitacion,
  nombreInvitado,
  tipoReunion: propTipoReunion,
  reunionId: propReunionId,
  onLeave,
  onError,
}: MeetingRoomProps) => {
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_BASE_DELAY_MS = 2000;
  const { theme, currentUser, session, activeWorkspace } = useStore();
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoReunion, setTipoReunion] = useState<TipoReunion>(propTipoReunion || 'equipo');
  const [reunionId, setReunionId] = useState<string | undefined>(propReunionId);
  const [showChat, setShowChat] = useState(false);
  const [cargoUsuario, setCargoUsuario] = useState<CargoLaboral>('colaborador');
  const [salaInfoFetched, setSalaInfoFetched] = useState(false);
  const [salaEspacioId, setSalaEspacioId] = useState<string | null>(null);
  const [invitadoExterno, setInvitadoExterno] = useState<InvitadoExterno | null>(null);
  const [guestPermissions, setGuestPermissions] = useState<GuestPermissions>({ allowChat: true, allowVideo: true });
  const [recoveryState, setRecoveryState] = useState<MeetingRecoveryState>({
    phase: 'connecting',
    reconnectAttempt: 0,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    lastRecoverableError: null,
    recoveryMessage: 'Conectando a la reunión…',
  });
  const tokenFetchedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userInitiatedLeaveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLeaveRef = useRef(onLeave);
  const onErrorRef = useRef(onError);
  const telemetryRef = useRef(new RealtimeSessionTelemetry({
    enabled: import.meta.env.DEV,
    scope: 'MeetingAccess',
    sessionKey: `meeting:${salaId}:${tokenInvitacion ? 'guest' : currentUser?.id ?? 'anon'}`,
  }));
  const requestKey = tokenInvitacion
    ? `guest:${tokenInvitacion}:${nombreInvitado ?? ''}`
    : `room:${salaId}:${session?.user?.id ?? 'anon'}`;

  onLeaveRef.current = onLeave;
  onErrorRef.current = onError;

  useEffect(() => {
    const cargarCargo = async () => {
      if (tokenInvitacion) {
        setCargoUsuario('otro');
        return;
      }

      if (!currentUser?.id || !activeWorkspace?.id) return;

      const { data } = await supabase
        .from('miembros_espacio')
        .select('cargo_id, cargo_ref:cargos!cargo_id(clave)')
        .eq('usuario_id', currentUser.id)
        .eq('espacio_id', activeWorkspace.id)
        .single();

      const clave = (data?.cargo_ref as any)?.clave;
      if (clave) {
        console.log('Cargo del usuario (MeetingRoom):', clave);
        setCargoUsuario(clave as CargoLaboral);
      }
    };

    void cargarCargo();
  }, [activeWorkspace?.id, currentUser?.id, tokenInvitacion]);

  const fetchToken = useCallback(async () => {
    try {
      setLoading((prev) => (tokenData ? prev : true));
      setError(null);
      setRecoveryState((prev) => ({
        ...prev,
        phase: reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting',
        reconnectAttempt: reconnectAttemptsRef.current,
        recoveryMessage: reconnectAttemptsRef.current > 0 ? 'Recuperando la conexión con la reunión…' : 'Conectando a la reunión…',
      }));
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'token_fetch_started',
        data: {
          salaId,
          reconnectAttempt: reconnectAttemptsRef.current,
          guest: Boolean(tokenInvitacion),
        },
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (session?.access_token && !tokenInvitacion) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const body: Record<string, any> = tokenInvitacion
        ? {
            token_invitacion: tokenInvitacion,
            ...(nombreInvitado ? { nombre_invitado: nombreInvitado } : {}),
          }
        : { sala_id: salaId };

      console.log('Calling LiveKit token Edge Function...');

      let request = inFlightTokenRequests.get(requestKey);
      if (!request) {
        request = (async () => {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/livekit-token`, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            const text = await response.text();
            return {
              status: response.status,
              statusText: response.statusText,
              text,
            };
          } finally {
            window.clearTimeout(timeoutId);
            inFlightTokenRequests.delete(requestKey);
          }
        })();
        inFlightTokenRequests.set(requestKey, request);
      }

      const response = await request;

      console.log('Response status:', response.status, response.statusText);

      const text = response.text;
      console.log('Response text:', text);

      if (!text) {
        throw new Error('Respuesta vacía del servidor. Verifica que LiveKit esté configurado.');
      }

      let data: TokenData;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Error parseando respuesta: ${text.substring(0, 200)}`);
      }

      if (response.status < 200 || response.status >= 300) {
        throw new Error((data as any).error || `Error ${response.status}: ${response.statusText}`);
      }

      setTokenData(data);
      setRecoveryState((prev) => ({
        ...prev,
        phase: reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting',
        lastRecoverableError: null,
        recoveryMessage: reconnectAttemptsRef.current > 0 ? 'Token renovado. Reconectando a la reunión…' : 'Acceso validado. Entrando a la reunión…',
      }));
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'token_fetch_succeeded',
        data: {
          salaId,
          reconnectAttempt: reconnectAttemptsRef.current,
          roomAdmin: Boolean(data.permisos?.roomAdmin),
        },
      });

      if (data.tipo_reunion) {
        const tipoMap: Record<string, TipoReunion> = {
          equipo: 'equipo',
          deal: 'deal',
          entrevista: 'entrevista',
        };
        setTipoReunion(tipoMap[data.tipo_reunion] || 'equipo');
      }

      if (data.reunion_id) {
        setReunionId(data.reunion_id);
      }
    } catch (err: any) {
      console.error('Error fetching token:', err);
      const message = err?.name === 'AbortError'
        ? 'La conexión al servidor tardó demasiado al preparar la reunión.'
        : err.message;
      setError(message);
      setRecoveryState((prev) => ({
        ...prev,
        phase: 'error',
        lastRecoverableError: message,
        recoveryMessage: 'No fue posible obtener acceso a la reunión.',
      }));
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'token_fetch_failed',
        severity: 'error',
        data: {
          salaId,
          reconnectAttempt: reconnectAttemptsRef.current,
          message: message ?? 'unknown',
        },
      });
      onErrorRef.current?.(message);
    } finally {
      setLoading(false);
    }
  }, [salaId, tokenInvitacion, nombreInvitado, requestKey, session?.access_token, tokenData]);

  useEffect(() => {
    if (tokenFetchedRef.current) return;
    tokenFetchedRef.current = true;
    void fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    if (propTipoReunion || salaInfoFetched || !tokenData) return;

    const fetchSalaInfo = async () => {
      const tipoMapBD: Record<string, TipoReunion> = {
        general: 'equipo',
        deal: 'deal',
        entrevista: 'entrevista',
      };
      const tipoMapUnificado: Record<TipoReunionUnificado, TipoReunion> = {
        equipo: 'equipo',
        one_to_one: 'equipo',
        cliente: 'deal',
        candidato: 'entrevista',
      };

      try {
        if (tokenInvitacion) {
          const { data, error: fnError } = await supabase.functions.invoke('validar-invitacion-reunion', {
            body: { token: tokenInvitacion },
          });

          if (fnError || data?.error) {
            throw new Error(fnError?.message || data?.error || 'Invitación no válida');
          }

          const salaData = data?.invitacion?.sala as any;
          if (salaData) {
            const config = salaData.configuracion;

            if (salaData.espacio_id) {
              setSalaEspacioId(salaData.espacio_id);
            }

            if (config?.tipo_reunion) {
              setTipoReunion(tipoMapUnificado[config.tipo_reunion as TipoReunionUnificado] || 'equipo');
            } else {
              setTipoReunion(tipoMapBD[salaData.tipo] || 'equipo');
            }

            if (config?.reunion_id) {
              setReunionId(config.reunion_id);
            }

            if (config?.invitados_externos?.[0]) {
              setInvitadoExterno(config.invitados_externos[0]);
            }

            if (config?.guests) {
              setGuestPermissions({
                allowChat: config.guests.allowChat ?? true,
                allowVideo: config.guests.allowVideo ?? true,
              });
            }
          }
        } else if (salaId) {
          const { data: sala } = await supabase
            .from('salas_reunion')
            .select('tipo, configuracion, espacio_id')
            .eq('id', salaId)
            .single();

          if (sala) {
            const config = sala.configuracion as any;
            if (config?.tipo_reunion) {
              setTipoReunion(tipoMapUnificado[config.tipo_reunion as TipoReunionUnificado] || 'equipo');
            } else {
              setTipoReunion(tipoMapBD[sala.tipo] || 'equipo');
            }

            if (config?.reunion_id) {
              setReunionId(config.reunion_id);
            }

            if (config?.invitados_externos?.[0]) {
              setInvitadoExterno(config.invitados_externos[0]);
            }

            if (sala.espacio_id) {
              setSalaEspacioId(sala.espacio_id);
              const { data: espacio } = await supabase
                .from('espacios_trabajo')
                .select('configuracion')
                .eq('id', sala.espacio_id)
                .single();

              if (espacio?.configuracion?.guests) {
                setGuestPermissions({
                  allowChat: espacio.configuracion.guests.allowChat ?? true,
                  allowVideo: espacio.configuracion.guests.allowVideo ?? true,
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('No se pudo obtener info de la sala:', err);
      } finally {
        setSalaInfoFetched(true);
      }
    };

    void fetchSalaInfo();
  }, [salaId, tokenInvitacion, propTipoReunion, tokenData, salaInfoFetched]);

  // Always resolve espacio_id from the sala when activeWorkspace is not available
  useEffect(() => {
    if (salaEspacioId || !salaId || !tokenData || tokenInvitacion) return;
    if (activeWorkspace?.id) {
      setSalaEspacioId(activeWorkspace.id);
      return;
    }

    const fetchEspacioId = async () => {
      try {
        const { data: sala } = await supabase
          .from('salas_reunion')
          .select('espacio_id')
          .eq('id', salaId)
          .single();
        if (sala?.espacio_id) {
          setSalaEspacioId(sala.espacio_id);
        }
      } catch {
        // Silently ignore — salaEspacioId will remain null
      }
    };

    void fetchEspacioId();
  }, [salaId, tokenData, tokenInvitacion, activeWorkspace?.id, salaEspacioId]);

  const startHeartbeat = useCallback(() => {
    if (tokenInvitacion || !currentUser) return;

    void supabase.rpc('heartbeat_participante', { p_sala_id: salaId, p_usuario_id: currentUser.id });
    heartbeatRef.current = setInterval(() => {
      void supabase.rpc('heartbeat_participante', { p_sala_id: salaId, p_usuario_id: currentUser.id });
    }, HEARTBEAT_INTERVAL_MS);
  }, [salaId, currentUser, tokenInvitacion]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopHeartbeat();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [stopHeartbeat]);

  const handleRoomConnected = useCallback(() => {
    console.log('Conectado a la sala');
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setRecoveryState({
      phase: 'connected',
      reconnectAttempt: 0,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      lastRecoverableError: null,
      recoveryMessage: null,
    });
    telemetryRef.current.record({
      category: 'meeting_access',
      name: 'room_connected',
      data: { salaId },
    });

    if (!tokenInvitacion && currentUser) {
      void supabase
        .from('participantes_sala')
        .update({ estado_participante: 'en_sala', ultima_actividad: new Date().toISOString() })
        .eq('sala_id', salaId)
        .eq('usuario_id', currentUser.id);
    }

    startHeartbeat();

    if (currentUser?.id && activeWorkspace?.id) {
      void otorgarXP(currentUser.id, activeWorkspace.id, XP_POR_ACCION.reunion_asistida, 'reunion_asistida');
    }
  }, [salaId, currentUser, tokenInvitacion, startHeartbeat, activeWorkspace?.id]);

  const handleUserLeave = useCallback(() => {
    userInitiatedLeaveRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    onLeaveRef.current?.();
  }, []);

  const handleLiveKitError = useCallback((err: Error) => {
    console.error('LiveKit error:', err);
    const msg = err.message || '';
    const isRecoverable =
      msg.includes('Device in use') ||
      msg.includes('NotReadableError') ||
      msg.includes('NotAllowedError') ||
      msg.includes('PC manager') ||
      msg.includes('UnexpectedConnectionState') ||
      msg.includes('already connected') ||
      msg.includes('Client initiated disconnect') ||
      msg.includes('disconnected') ||
      msg.includes('websocket') ||
      msg.includes('signal') ||
      msg.includes('timeout');

    if (!isRecoverable) {
      setError(msg);
      setRecoveryState({
        phase: 'error',
        reconnectAttempt: reconnectAttemptsRef.current,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        lastRecoverableError: msg,
        recoveryMessage: 'La reunión encontró un error no recuperable.',
      });
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'room_error_fatal',
        severity: 'error',
        data: { salaId, message: msg },
      });
    } else {
      console.warn('Error recuperable de LiveKit (ignorado):', msg);
      setRecoveryState((prev) => ({
        ...prev,
        phase: 'degraded',
        lastRecoverableError: msg,
        recoveryMessage: 'La reunión detectó inestabilidad e intentará recuperarse automáticamente.',
      }));
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'room_error_recoverable',
        severity: 'warn',
        data: { salaId, message: msg },
      });
    }
  }, []);

  const handleToggleChat = useCallback(() => {
    setShowChat((prev) => !prev);
  }, []);

  const handleRoomDisconnected = useCallback(() => {
    console.log('Desconectado de la sala');
    stopHeartbeat();
    telemetryRef.current.record({
      category: 'meeting_access',
      name: 'room_disconnected',
      severity: userInitiatedLeaveRef.current ? 'info' : 'warn',
      data: {
        salaId,
        userInitiated: userInitiatedLeaveRef.current,
        reconnectAttempt: reconnectAttemptsRef.current,
      },
    });

    if (userInitiatedLeaveRef.current) {
      // Salida voluntaria — actualizar estado y navegar
      if (!tokenInvitacion && currentUser) {
        void supabase
          .from('participantes_sala')
          .update({ estado_participante: 'desconectado', salido_en: new Date().toISOString() })
          .eq('sala_id', salaId)
          .eq('usuario_id', currentUser.id);
      }
      onLeaveRef.current?.();
      return;
    }

    // Desconexión inesperada — intentar reconectar
    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current += 1;
      const delay = RECONNECT_BASE_DELAY_MS * reconnectAttemptsRef.current;
      console.log(`Reconexión automática intento ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} en ${delay}ms...`);
      setRecoveryState({
        phase: 'reconnecting',
        reconnectAttempt: reconnectAttemptsRef.current,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        lastRecoverableError: recoveryState.lastRecoverableError,
        recoveryMessage: `Reconectando a la reunión (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})…`,
      });
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'room_reconnect_scheduled',
        severity: 'warn',
        data: {
          salaId,
          reconnectAttempt: reconnectAttemptsRef.current,
          delay,
        },
      });

      reconnectTimerRef.current = setTimeout(() => {
        console.log('Reobteniendo token para reconexión...');
        tokenFetchedRef.current = false;
        reconnectTimerRef.current = null;
        void fetchToken();
      }, delay);
    } else {
      // Agotados los intentos — marcar como desconectado
      console.warn('Reconexión agotada, mostrando error.');
      if (!tokenInvitacion && currentUser) {
        void supabase
          .from('participantes_sala')
          .update({ estado_participante: 'desconectado', salido_en: new Date().toISOString() })
          .eq('sala_id', salaId)
          .eq('usuario_id', currentUser.id);
      }
      setError('Se perdió la conexión con la sala. Por favor reintenta.');
      setRecoveryState({
        phase: 'error',
        reconnectAttempt: reconnectAttemptsRef.current,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        lastRecoverableError: recoveryState.lastRecoverableError,
        recoveryMessage: 'No fue posible recuperar la conexión automáticamente. Puedes reintentar manualmente.',
      });
      telemetryRef.current.record({
        category: 'meeting_access',
        name: 'room_reconnect_exhausted',
        severity: 'error',
        data: {
          salaId,
          reconnectAttempt: reconnectAttemptsRef.current,
        },
      });
    }
  }, [salaId, currentUser, tokenInvitacion, stopHeartbeat, fetchToken, recoveryState.lastRecoverableError]);

  return {
    theme,
    currentUser,
    session,
    activeWorkspace,
    tokenData,
    loading,
    error,
    tipoReunion,
    reunionId,
    showChat,
    cargoUsuario,
    invitadoExterno,
    guestPermissions,
    recoveryState,
    salaEspacioId,
    fetchToken,
    handleRoomConnected,
    handleRoomDisconnected,
    handleLiveKitError,
    handleUserLeave,
    handleToggleChat,
  };
};
