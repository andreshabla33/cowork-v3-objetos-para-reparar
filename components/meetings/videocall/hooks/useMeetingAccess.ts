import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import { SUPABASE_URL } from '@/lib/supabase';
import { otorgarXP, XP_POR_ACCION } from '@/lib/gamificacion';
import { RealtimeSessionTelemetry } from '@/modules/realtime-room';
import { meetingAccessRepository } from '@/src/core/infrastructure/adapters/MeetingAccessSupabaseRepository';
import { ObtenerAccesoReunionUseCase } from '@/src/core/application/usecases/ObtenerAccesoReunionUseCase';
import type { CargoLaboral } from '../../recording/types/analysis';
import type { InvitadoExterno, TipoReunionUnificado } from '@/types/meeting-types';
import type { GuestPermissions, MeetingRecoveryState, MeetingRoomProps, TokenData } from '../meetingRoom.types';
import type { TipoReunion } from '../MeetingControlBar';

const log = logger.child('use-meeting-access');
const obtenerAcceso = new ObtenerAccesoReunionUseCase(meetingAccessRepository);

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

      const result = await obtenerAcceso.obtenerCargoUsuario(currentUser.id, activeWorkspace.id);
      if (result.cargo) {
        log.debug('User cargo loaded', { cargo: result.cargo });
        setCargoUsuario(result.cargo as CargoLaboral);
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

      const body: Record<string, string | undefined> = tokenInvitacion
        ? {
            token_invitacion: tokenInvitacion,
            ...(nombreInvitado ? { nombre_invitado: nombreInvitado } : {}),
          }
        : { sala_id: salaId };

      log.debug('Calling LiveKit token Edge Function');

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

      log.debug('Token response received', { status: response.status, statusText: response.statusText });

      const text = response.text;

      if (!text) {
        throw new Error('Respuesta vacía del servidor. Verifica que LiveKit esté configurado.');
      }

      let data: TokenData;
      try {
        data = JSON.parse(text);
      } catch (parseError: unknown) {
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
        throw new Error(`Error parseando respuesta: ${text.substring(0, 200)} (${errorMsg})`);
      }

      if (response.status < 200 || response.status >= 300) {
        const errorData = data as Record<string, unknown>;
        throw new Error(String(errorData.error) || `Error ${response.status}: ${response.statusText}`);
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
    } catch (err: unknown) {
      let message = 'Error desconocido';
      if (err instanceof Error) {
        message = err.name === 'AbortError'
          ? 'La conexión al servidor tardó demasiado al preparar la reunión.'
          : err.message;
      }
      log.error('Error fetching token', { message });
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
          const invData = await obtenerAcceso.validarInvitacion(tokenInvitacion);

          if (invData.sala) {
            const config = invData.sala.configuracion as Record<string, unknown>;

            if (invData.sala.espacio_id) {
              setSalaEspacioId(invData.sala.espacio_id);
            }

            const configTipoReunion = config?.tipo_reunion as TipoReunionUnificado | undefined;
            if (configTipoReunion) {
              setTipoReunion(tipoMapUnificado[configTipoReunion] || 'equipo');
            } else {
              setTipoReunion(tipoMapBD[invData.sala.tipo] || 'equipo');
            }

            const configReunionId = config?.reunion_id as string | undefined;
            if (configReunionId) {
              setReunionId(configReunionId);
            }

            const configInvitadosExternos = config?.invitados_externos as InvitadoExterno[] | undefined;
            if (configInvitadosExternos?.[0]) {
              setInvitadoExterno(configInvitadosExternos[0]);
            }

            const configGuests = config?.guests as Record<string, unknown> | undefined;
            if (configGuests) {
              setGuestPermissions({
                allowChat: (configGuests.allowChat ?? true) as boolean,
                allowVideo: (configGuests.allowVideo ?? true) as boolean,
              });
            }
          }
        } else if (salaId) {
          const sala = await obtenerAcceso.obtenerSalaPorId(salaId);

          if (sala) {
            const config = sala.configuracion as Record<string, unknown>;
            const configTipoReunion = config?.tipo_reunion as TipoReunionUnificado | undefined;
            if (configTipoReunion) {
              setTipoReunion(tipoMapUnificado[configTipoReunion] || 'equipo');
            } else {
              setTipoReunion(tipoMapBD[sala.tipo] || 'equipo');
            }

            const configReunionId = config?.reunion_id as string | undefined;
            if (configReunionId) {
              setReunionId(configReunionId);
            }

            const configInvitadosExternos = config?.invitados_externos as InvitadoExterno[] | undefined;
            if (configInvitadosExternos?.[0]) {
              setInvitadoExterno(configInvitadosExternos[0]);
            }

            if (sala.espacio_id) {
              setSalaEspacioId(sala.espacio_id);
              const permisos = await obtenerAcceso.obtenerPermisosInvitado(sala.espacio_id);
              setGuestPermissions({
                allowChat: permisos.allowChat,
                allowVideo: permisos.allowVideo,
              });
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido al obtener info de la sala';
        log.warn('Could not fetch sala info', { message });
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
        const sala = await obtenerAcceso.obtenerSalaPorId(salaId);
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

    void obtenerAcceso.heartbeat(salaId, currentUser.id);
    heartbeatRef.current = setInterval(() => {
      void obtenerAcceso.heartbeat(salaId, currentUser.id);
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
    log.info('Room connected');
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
      void obtenerAcceso.actualizarEstado(salaId, currentUser.id, {
        estado_participante: 'en_sala',
        ultima_actividad: new Date().toISOString(),
      });
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
    log.error('LiveKit error', { message: err.message });
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
      log.warn('Recoverable LiveKit error (ignored)', { message: msg });
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
    log.info('Room disconnected');
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
        void obtenerAcceso.actualizarEstado(salaId, currentUser.id, {
          estado_participante: 'desconectado',
          salido_en: new Date().toISOString(),
        });
      }
      onLeaveRef.current?.();
      return;
    }

    // Desconexión inesperada — intentar reconectar
    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current += 1;
      const delay = RECONNECT_BASE_DELAY_MS * reconnectAttemptsRef.current;
      log.debug('Scheduling automatic reconnection', { attempt: reconnectAttemptsRef.current, delay });
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
        log.debug('Fetching new token for reconnection');
        tokenFetchedRef.current = false;
        reconnectTimerRef.current = null;
        void fetchToken();
      }, delay);
    } else {
      // Agotados los intentos — marcar como desconectado
      log.warn('Reconnection exhausted, showing error');
      if (!tokenInvitacion && currentUser) {
        void obtenerAcceso.actualizarEstado(salaId, currentUser.id, {
          estado_participante: 'desconectado',
          salido_en: new Date().toISOString(),
        });
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
