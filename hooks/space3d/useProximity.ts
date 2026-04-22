/**
 * @module hooks/space3d/useProximity
 * Hook para detección de proximidad con histéresis, cálculo de usersInCall,
 * usersInAudioRange, distancias, y routing de streams remotos.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';
import type { UserSettings } from '@/lib/userSettings';
import { AUDIO_SPATIAL_RADIUS_FACTOR, PROXIMITY_ACTIVATION_FACTOR, PROXIMITY_COORD_THRESHOLD, PROXIMITY_EXIT_FACTOR, type UseProximityReturn } from './types';
import { useStore } from '@/store/useStore';
import { ActiveSpeakerPolicy, GalleryPolicy } from '@/modules/realtime-room';
import { normalizarConfiguracionZonaEmpresa } from '@/src/core/domain/entities/cerramientosZona';
import { logger } from '@/lib/logger';

const log = logger.child('useProximity');

/** Check if a point (px, py) is inside a zone's bounding box */
const isPointInZone = (px: number, py: number, zona: { posicion_x: number | string; posicion_y: number | string; ancho: number | string; alto: number | string }): boolean => {
  const halfW = Number(zona.ancho) / 2;
  const halfH = Number(zona.alto) / 2;
  const cx = Number(zona.posicion_x);
  const cy = Number(zona.posicion_y);
  return px >= (cx - halfW) && px <= (cx + halfW) && py >= (cy - halfH) && py <= (cy + halfH);
};

/** Max number of non-speaker videos shown in mega rooms, scaled by room population */
const getMegaRoomVideoLimit = (peopleCount: number): number => {
  if (peopleCount > 30) return 2;
  if (peopleCount > 15) return 3;
  return 5;
};

export function useProximity(params: {
  currentUserEcs: User;
  usuariosEnChunks: User[];
  session: Session | null;
  currentUser: User;
  isScreenShareEnabled: boolean;
  userProximityRadius: number;
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  speakingUsers: Set<string>;
  raisedHandParticipantIds?: Iterable<string>;
  performanceSettings: UserSettings['performance'];
  selectedRemoteUser: User | null;
  setSelectedRemoteUser: React.Dispatch<React.SetStateAction<User | null>>;
  handleToggleScreenShare: () => Promise<void>;
}): UseProximityReturn {
  const {
    currentUserEcs, usuariosEnChunks, session, currentUser, isScreenShareEnabled,
    userProximityRadius, remoteStreams, remoteScreenStreams,
    speakingUsers, raisedHandParticipantIds, performanceSettings,
    selectedRemoteUser, setSelectedRemoteUser, handleToggleScreenShare,
  } = params;
  const activeSpeakerPolicyRef = useRef(new ActiveSpeakerPolicy());
  const galleryPolicyRef = useRef(new GalleryPolicy());

  // ========== Coordenadas estabilizadas para cálculo de proximidad ==========
  const [stableProximityCoords, setStableProximityCoords] = useState({ x: currentUserEcs.x, y: currentUserEcs.y });
  const stableProximityCoordsRef = useRef({ x: currentUserEcs.x, y: currentUserEcs.y });

  useEffect(() => {
    const dx = currentUserEcs.x - stableProximityCoordsRef.current.x;
    const dy = currentUserEcs.y - stableProximityCoordsRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= PROXIMITY_COORD_THRESHOLD) {
      stableProximityCoordsRef.current = { x: currentUserEcs.x, y: currentUserEcs.y };
      setStableProximityCoords({ x: currentUserEcs.x, y: currentUserEcs.y });
    }
  }, [currentUserEcs.x, currentUserEcs.y]);

  // ========== Hydration gate (Opción A — patrón Phoenix presence_state) ========
  // Evita "proximidad fantasma" al arrancar: durante los primeros ms tanto la
  // posición local como las presencias remotas pueden estar en estado default
  // (antes de que lleguen los primeros packets reales), lo que hace que
  // useProximity calcule distancia=0 y dispare eventos de "entrada en
  // proximidad" espurios. Esos eventos propagan a:
  //   - Player3D: auto-wave animation (saludo) + XP
  //   - Avatar3DScene: videoHUD, audio spatial, etc.
  //   - wavedToUsersRef: marca al usuario como "ya saludado" → saludo real
  //     posterior nunca se dispara (bug UX silencioso).
  //
  // El flag `isHydrated` bloquea usersInCall y usersInAudioRange hasta que
  // alguna de estas condiciones se cumpla:
  //   (a) las coordenadas locales cambien del valor inicial (usuario se movió
  //       O su posición real llegó del DB/ECS después del mount), O
  //   (b) pase un grace period de 1500ms (cubre el caso en que el usuario
  //       no se mueva y no haya posición inicial distinta del default).
  //
  // Patrón alineado con:
  //  - Phoenix Channels: `presence_state` (snapshot inicial) antes de
  //    reaccionar a `presence_diff`.
  //  - Supabase Realtime Presence docs: warning explícito de sync events
  //    espurios durante reconciliación inicial.
  //    https://supabase.com/docs/guides/realtime/presence
  //  - Game networking (Gambetta, Unity NetCode, Mirror): "hydration guard"
  //    antes de disparar callbacks OnPlayerEntered.
  //    https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
  //  - React best practice: useRef para flags de "mount completado" sin
  //    forzar re-render extra.
  const [isHydrated, setIsHydrated] = useState(false);
  const initialCoordsRef = useRef<{ x: number; y: number } | null>(null);
  if (initialCoordsRef.current === null) {
    initialCoordsRef.current = { x: currentUserEcs.x, y: currentUserEcs.y };
  }

  useEffect(() => {
    if (isHydrated) return;
    const initial = initialCoordsRef.current;
    if (!initial) return;
    if (stableProximityCoords.x !== initial.x || stableProximityCoords.y !== initial.y) {
      setIsHydrated(true);
      log.info('Proximity hydrated via coord update', {
        initialX: initial.x,
        initialY: initial.y,
        currentX: stableProximityCoords.x,
        currentY: stableProximityCoords.y,
      });
    }
  }, [stableProximityCoords.x, stableProximityCoords.y, isHydrated]);

  useEffect(() => {
    if (isHydrated) return;
    const timer = setTimeout(() => {
      setIsHydrated(true);
      log.info('Proximity hydrated via grace period (1500ms)');
    }, 1500);
    return () => clearTimeout(timer);
  }, [isHydrated]);

  // ========== Histéresis refs ==========
  const connectedUsersRef = useRef<Set<string>>(new Set());

  // Store for getting current active zones
  const zonasEmpresa = useStore((state) => state.zonasEmpresa);

  // ========== Pre-filtro: zonas de tipo meeting ==========
  const meetingZones = useMemo(() => {
    if (!zonasEmpresa || zonasEmpresa.length === 0) return [];
    return zonasEmpresa.filter(zona => {
      const config = normalizarConfiguracionZonaEmpresa(zona.configuracion);
      return config.plantilla_zona?.id === 'sala_juntas' || config.plantilla_zona?.id === 'sala_meeting_grande';
    });
  }, [zonasEmpresa]);

  // ========== Detección de Zonas de Aislamiento (Meeting) ==========
  const myCurrentZone = useMemo(() => {
    if (meetingZones.length === 0) return null;
    return meetingZones.find(zona =>
      isPointInZone(stableProximityCoords.x, stableProximityCoords.y, zona)
    ) ?? null;
  }, [stableProximityCoords.x, stableProximityCoords.y, meetingZones]);

  // Grace period: remember last zone for 1s after leaving to avoid flicker at edges
  const lastMeetingZoneRef = useRef<typeof myCurrentZone>(null);
  const lastMeetingZoneTimestampRef = useRef(0);
  const effectiveZone = useMemo(() => {
    if (myCurrentZone) {
      lastMeetingZoneRef.current = myCurrentZone;
      lastMeetingZoneTimestampRef.current = Date.now();
      return myCurrentZone;
    }
    // Grace period: keep old zone for 1s after leaving
    if (lastMeetingZoneRef.current && (Date.now() - lastMeetingZoneTimestampRef.current) < 1000) {
      return lastMeetingZoneRef.current;
    }
    lastMeetingZoneRef.current = null;
    return null;
  }, [myCurrentZone]);

  // ========== Estados de privacidad (patrón Gather) ==========
  const [conversacionBloqueada, setConversacionBloqueada] = useState(false);
  const [conversacionesBloqueadasRemoto, setConversacionesBloqueadasRemoto] = useState<Map<string, string[]>>(new Map());

  // ========== usersInCall con histéresis ==========
  const usersInCall = useMemo(() => {
    // Hydration gate: hasta que las posiciones estén confirmadas no hay
    // proximidad ni efectos derivados (ver bloque de hydration arriba).
    if (!isHydrated) return [];

    const nextConnectedUsers = new Set<string>();

    const idsBloqueadosProximidad = new Set<string>();
    conversacionesBloqueadasRemoto.forEach((participants, lockerId) => {
      if (!session?.user?.id || participants.includes(session.user.id)) return;
      participants.forEach(pid => idsBloqueadosProximidad.add(pid));
      idsBloqueadosProximidad.add(lockerId);
    });

    const users = usuariosEnChunks.filter(u => {
      if (u.id === session?.user?.id) return false;
      if (u.esFantasma) return false;
      if (idsBloqueadosProximidad.has(u.id)) return false;
      if ((u.x === 0 && u.y === 0) || typeof u.x !== 'number' || typeof u.y !== 'number' ||
          typeof stableProximityCoords.x !== 'number' || typeof stableProximityCoords.y !== 'number') {
        return false;
      }

      let inProximity = false;
      let dist = 0;
      let threshold = 0;
      const wasInCall = connectedUsersRef.current.has(u.id);

      if (effectiveZone) {
        // Gather-style meeting room isolation:
        // Only connect with people in the EXACT SAME zone
        inProximity = isPointInZone(u.x, u.y, effectiveZone);
      } else {
        // Lógica normal por distancia
        dist = Math.sqrt(Math.pow(u.x - stableProximityCoords.x, 2) + Math.pow(u.y - stableProximityCoords.y, 2));
        threshold = wasInCall
          ? userProximityRadius * PROXIMITY_EXIT_FACTOR
          : userProximityRadius * PROXIMITY_ACTIVATION_FACTOR;
        inProximity = dist < threshold;
      }

      if (inProximity) {
        nextConnectedUsers.add(u.id);
        if (!wasInCall) {
          if (effectiveZone) {
            log.info('User entered zone', {
              userName: u.name,
              zoneName: effectiveZone.nombre_zona || effectiveZone.id,
              zoneId: effectiveZone.id,
            });
          } else {
            log.info('User entered proximity', {
              userName: u.name,
              distance: Number(dist.toFixed(1)),
              threshold: userProximityRadius,
            });
          }
          if (selectedRemoteUser?.id === u.id) setSelectedRemoteUser(null);
        }
      } else if (wasInCall) {
        if (effectiveZone) {
          log.info('User left zone', {
            userName: u.name,
            zoneName: effectiveZone.nombre_zona || effectiveZone.id,
            zoneId: effectiveZone.id,
          });
        } else {
          log.info('User left proximity', {
            userName: u.name,
            distance: Number(dist.toFixed(1)),
            threshold: Number(threshold.toFixed(1)),
          });
        }
      }

      return inProximity;
    });

    // Auto-stop screen share si no hay nadie
    if (users.length === 0 && isScreenShareEnabled) {
      setTimeout(() => { handleToggleScreenShare(); }, 0);
    }

    connectedUsersRef.current = nextConnectedUsers;
    return users;
  }, [isHydrated, usuariosEnChunks, stableProximityCoords.x, stableProximityCoords.y, session?.user?.id, isScreenShareEnabled, userProximityRadius, conversacionesBloqueadasRemoto, effectiveZone]);

  const hasActiveCall = usersInCall.length > 0;
  const usersInCallIds = useMemo(() => new Set(usersInCall.map(u => u.id)), [usersInCall]);

  // ========== Usuarios en rango de audio espacial ==========
  const usersInAudioRange = useMemo(() => {
    // Mismo gate de hydration que usersInCall (arriba).
    if (!isHydrated) return [];
    // In a meeting zone, audio range is irrelevant — meeting isolation handles everything
    if (effectiveZone) return [];

    const audioRadius = userProximityRadius * AUDIO_SPATIAL_RADIUS_FACTOR;
    const idsEnProximidad = new Set(usersInCall.map(u => u.id));
    return usuariosEnChunks.filter(u => {
      if (u.id === session?.user?.id) return false;
      if (u.esFantasma) return false;
      if (idsEnProximidad.has(u.id)) return false;
      if ((u.x === 0 && u.y === 0) || typeof u.x !== 'number' || typeof u.y !== 'number') return false;
      // Don't include users who are themselves inside a meeting zone (they're isolated)
      const userInAnyMeeting = meetingZones.some(z => isPointInZone(u.x, u.y, z));
      if (userInAnyMeeting) return false;
      const dist = Math.sqrt(Math.pow(u.x - stableProximityCoords.x, 2) + Math.pow(u.y - stableProximityCoords.y, 2));
      return dist < audioRadius;
    });
  }, [isHydrated, usuariosEnChunks, stableProximityCoords.x, stableProximityCoords.y, session?.user?.id, userProximityRadius, usersInCall, effectiveZone, meetingZones]);

  const usersInAudioRangeIds = useMemo(() => new Set(usersInAudioRange.map(u => u.id)), [usersInAudioRange]);

  // Mirror to Zustand so consumers outside the 3D hook tree (chat notifications,
  // hand-raise sounds) can spatially gate without needing props threaded down.
  const setUsersInAudioRangeIdsInStore = useStore((s) => s.setUsersInAudioRangeIds);
  useEffect(() => {
    setUsersInAudioRangeIdsInStore(usersInAudioRangeIds);
  }, [usersInAudioRangeIds, setUsersInAudioRangeIdsInStore]);

  // ========== Distancias ==========
  const userDistances = useMemo(() => {
    const distances = new Map<string, number>();
    usersInCall.forEach(u => {
      const dist = Math.sqrt(Math.pow(u.x - currentUserEcs.x, 2) + Math.pow(u.y - currentUserEcs.y, 2));
      distances.set(u.id, dist);
    });
    return distances;
  }, [usersInCall, currentUserEcs.x, currentUserEcs.y]);

  // ========== Video stream routing ==========
  const maxVideoStreams = useMemo(() => {
    const limite = Number(performanceSettings.maxVideoStreams ?? 8);
    return Number.isFinite(limite) ? Math.max(1, limite) : 8;
  }, [performanceSettings.maxVideoStreams]);

  const orderedUsersInCall = useMemo(() => {
    const distanceSortedUsers = [...usersInCall].sort((left, right) => {
      const leftDistance = userDistances.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightDistance = userDistances.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftDistance - rightDistance;
    });

    const distanceSortedIds = distanceSortedUsers.map((user) => user.id);
    const activeSpeakerId = distanceSortedIds.find((id) => speakingUsers.has(id)) ?? null;
    const featuredParticipantId = activeSpeakerPolicyRef.current.resolveFeaturedParticipantId({
      participantIds: distanceSortedIds,
      activeSpeakerId,
      pinnedParticipantId: null,
      effectiveMode: 'speaker',
    });
    const orderedIds = galleryPolicyRef.current.orderParticipantIds({
      participantIds: distanceSortedIds,
      featuredParticipantId,
      activeSpeakerId,
      raisedHandParticipantIds,
    });
    const usersById = new Map(distanceSortedUsers.map((user) => [user.id, user]));
    return orderedIds.map((id) => usersById.get(id)).filter(Boolean) as User[];
  }, [raisedHandParticipantIds, speakingUsers, userDistances, usersInCall]);

  const prioritizedVideoIds = useMemo(() => {
    // Detect mega room for aggressive video limiting
    const isMegaRoom = effectiveZone ? (
      normalizarConfiguracionZonaEmpresa(effectiveZone.configuracion).plantilla_zona?.id === 'sala_meeting_grande'
    ) : false;
    const peopleInMyZone = isMegaRoom ? usersInCall.length : 0;

    const inCallIds = orderedUsersInCall.map(u => u.id);
    const audioRangeIds = usersInAudioRange.map(u => u.id);
    const activeSpeakerId = inCallIds.find((id) => speakingUsers.has(id)) ?? null;
    const orderedCandidateIds = galleryPolicyRef.current.orderParticipantIds({
      participantIds: [...inCallIds, ...audioRangeIds],
      featuredParticipantId: activeSpeakerId,
      activeSpeakerId,
      raisedHandParticipantIds,
    });

    // In mega rooms, dynamically limit video based on room population
    if (isMegaRoom && peopleInMyZone > 8) {
      const limit = getMegaRoomVideoLimit(peopleInMyZone);
      return Array.from(new Set(orderedCandidateIds.slice(0, limit + 1)));
    }

    // Normal behavior: speakers first, then closest, then audio-range
    return Array.from(new Set(orderedCandidateIds));
  }, [effectiveZone, orderedUsersInCall, raisedHandParticipantIds, speakingUsers, usersInAudioRange, usersInCall.length]);

  const allowedVideoIds = useMemo(() => {
    const screenIds = new Set<string>();
    remoteScreenStreams.forEach((s, id) => {
      if (s?.getVideoTracks().length) screenIds.add(id);
    });
    const allowed = new Set<string>(screenIds);
    const limite = maxVideoStreams + screenIds.size + usersInAudioRange.length;
    prioritizedVideoIds.forEach(id => {
      if (allowed.size >= limite) return;
      allowed.add(id);
    });
    return allowed;
  }, [maxVideoStreams, prioritizedVideoIds, remoteScreenStreams, usersInAudioRange.length]);

  const remoteStreamsRouted = useMemo(() => {
    const next = new Map<string, MediaStream>();
    remoteStreams.forEach((s, id) => {
      if (allowedVideoIds.has(id)) next.set(id, s);
    });
    return next;
  }, [remoteStreams, allowedVideoIds]);

  const remoteScreenStreamsRouted = useMemo(() => {
    const next = new Map<string, MediaStream>();
    remoteScreenStreams.forEach((s, id) => {
      if (allowedVideoIds.has(id)) next.set(id, s);
    });
    return next;
  }, [remoteScreenStreams, allowedVideoIds]);

  // ========== Conversación bloqueada cercana ==========
  const conversacionProximaBloqueada = useMemo(() => {
    if (!session?.user?.id || conversacionesBloqueadasRemoto.size === 0) return null;
    for (const [lockerId, participants] of conversacionesBloqueadasRemoto) {
      if (participants.includes(session.user.id)) continue;
      const usuarioBloqueado = usersInCall.find(u => participants.includes(u.id) || u.id === lockerId);
      if (usuarioBloqueado) {
        return { lockerId, participants, nombre: usuarioBloqueado.name };
      }
    }
    return null;
  }, [conversacionesBloqueadasRemoto, usersInCall, session?.user?.id]);

  return {
    stableProximityCoords,
    usersInCall,
    orderedUsersInCall,
    usersInCallIds,
    hasActiveCall,
    usersInAudioRange,
    usersInAudioRangeIds,
    userDistances,
    remoteStreamsRouted,
    remoteScreenStreamsRouted,
    conversacionBloqueada,
    setConversacionBloqueada,
    conversacionesBloqueadasRemoto,
    setConversacionesBloqueadasRemoto,
    conversacionProximaBloqueada,
  };
}
