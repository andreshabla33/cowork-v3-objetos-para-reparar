'use client';
import React, { useRef, useEffect, useMemo, Suspense, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Grid, Text, Html, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { logger } from '@/lib/logger';
import type { AccionXP } from '@/lib/gamificacion';
import { getApplicationServices } from '@/src/core/application/ApplicationServicesContainer';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import { useAvatarControls } from '../avatar3d/useAvatarControls';
import type { AnimationState } from '../avatar3d/shared';
import { VideoWithBackground } from '../VideoWithBackground';
import { GhostAvatar } from '../3d/GhostAvatar';
import { ZonaEmpresa as ZonaEmpresa3D } from '../3d/ZonaEmpresa';
import { Escritorio3D } from '../3d/Escritorio3D';
import type { EspacioObjeto, SpawnPersonal } from '@/hooks/space3d/useEspacioObjetos';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ObjetosInteractivos } from '../3d/ObjetosInteractivos';
import { ParticulasClima } from '../3d/ParticulasClima';
import { EmoteSync, useSyncEffects } from '../3d/EmoteSync';
import { hapticFeedback, isMobileDevice } from '@/lib/mobileDetect';
import { useStore } from '@/store/useStore';
import { type CameraSettings } from '@/modules/realtime-room';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { type JoystickInput } from '../3d/MobileJoystick';
import { getSettingsSection } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar, themeColors,
  MOVE_SPEED, RUN_SPEED, WORLD_SIZE, TELEPORT_DISTANCE,
  CHAIR_SIT_RADIUS, CHAIR_POSITIONS_3D, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE,
  IconPrivacy, IconExpand, obtenerDireccionDesdeVector,
  STAND_UP_GRACE_PERIOD, ANIMATION_SIT_DOWN_DURATION, RADIO_COLISION_AVATAR,
  ALTURA_AVATAR_ESTANDAR, ALTURA_CADERA_AVATAR_SENTADO,
} from './shared';
import { esAnimacionAsiento, resolverAsientoUsuario, type AsientoRuntime3D } from './asientosRuntime';
import { esPosicionTransitable, type ObstaculoColision3D } from './colisionesRuntime';
import { resolverMovimientoConDeslizamiento } from './movimientoRuntime';
import type { OcupacionAsientoReal } from '@/hooks/space3d/useOcupacionAsientos';
import { statusColors, STATUS_LABELS, type VirtualSpace3DProps } from './spaceTypes';
import { Avatar, type AvatarProps } from './Avatar3DScene';
import { TeleportEffect } from './Avatar3DScene';
import { useSeatDetection } from '@/hooks/space3d/useSeatDetection';

const log = logger.child('Player3D');

// --- Player ---
export interface PlayerProps {
  currentUser: User;
  setPosition: (x: number, y: number, direction: string, isSitting: boolean, isMoving: boolean) => void;
  stream: MediaStream | null;
  /** LocalVideoTrack del usuario actual con processor aplicado. Se usa
   *  para que la burbuja del avatar propio renderice el stream procesado
   *  (blur / virtual bg) desde el primer frame, independiente de si la
   *  publicación a LiveKit ocurrió (gating por proximidad). */
  localVideoTrack?: import('livekit-client').LocalVideoTrack | null;
  /** Tipo de efecto activo — reenviado al Avatar para su burbuja local. */
  backgroundEffect?: import('@/src/core/domain/ports/IVideoTrackProcessor').EffectType;
  showVideoBubble?: boolean;
  videoIsProcessed?: boolean;
  message?: string | null;
  reactions?: Array<{ id: string; emoji: string }>;
  onClickAvatar?: () => void;
  moveTarget?: { x: number; z: number } | null;
  onReachTarget?: () => void;
  teleportTarget?: { x: number; z: number } | null;
  onTeleportDone?: () => void;
  broadcastMovement?: (x: number, y: number, direction: string, isMoving: boolean, animState?: string, reliable?: boolean) => void;
  moveSpeed?: number;
  runSpeed?: number;
  ecsStateRef?: React.MutableRefObject<EstadoEcsEspacio>;
  onPositionUpdate?: (x: number, z: number) => void;
  zonasEmpresa?: ZonaEmpresa[];
  spawnPersonal?: SpawnPersonal;
  onGuardarPosicionPersistente?: (x: number, z: number) => Promise<boolean>;
  empresasAutorizadas?: string[];
  usersInCallIds?: Set<string>;
  mobileInputRef?: React.MutableRefObject<JoystickInput>;
  onXPEvent?: (accion: AccionXP, cooldownMs?: number) => void;
  espacioObjetos?: EspacioObjeto[];
  asientos?: AsientoRuntime3D[];
  ocupacionesAsientosPorObjetoId?: Map<string, OcupacionAsientoReal>;
  onOcuparAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onLiberarAsiento?: (asiento: AsientoRuntime3D | null) => Promise<boolean>;
  onRefrescarAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  obstaculos?: ObstaculoColision3D[];
}

export const Player: React.FC<PlayerProps> = ({ currentUser, setPosition, stream, localVideoTrack, backgroundEffect = 'none', showVideoBubble = true, videoIsProcessed = false, message, reactions = [], onClickAvatar, moveTarget, onReachTarget, teleportTarget, onTeleportDone, broadcastMovement, moveSpeed, runSpeed, ecsStateRef, onPositionUpdate, zonasEmpresa = [], spawnPersonal = { spawn_x: null, spawn_z: null }, onGuardarPosicionPersistente, empresasAutorizadas = [], usersInCallIds, mobileInputRef, onXPEvent, espacioObjetos = [], asientos = [], ocupacionesAsientosPorObjetoId = new Map(), onOcuparAsiento, onLiberarAsiento, onRefrescarAsiento, obstaculos = [] }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  // Refs para acceso seguro dentro de useFrame
  const zonasRef = useRef(zonasEmpresa);
  const empresasAuthRef = useRef(empresasAutorizadas);
  const asientosRef = useRef(asientos);
  const ocupacionesAsientosRef = useRef(ocupacionesAsientosPorObjetoId);
  const obstaculosRef = useRef(obstaculos);
  const seatRuntimeRef = useRef<AsientoRuntime3D | null>(null);
  const reservaAsientoEnCursoRef = useRef<string | null>(null);

  // Sincronizar refs
  useEffect(() => { zonasRef.current = zonasEmpresa; }, [zonasEmpresa]);
  useEffect(() => { empresasAuthRef.current = empresasAutorizadas; }, [empresasAutorizadas]);
  useEffect(() => { asientosRef.current = asientos; }, [asientos]);
  useEffect(() => { ocupacionesAsientosRef.current = ocupacionesAsientosPorObjetoId; }, [ocupacionesAsientosPorObjetoId]);
  useEffect(() => { obstaculosRef.current = obstaculos; }, [obstaculos]);

  const obtenerZonaPropiaActiva = useCallback(() => {
    if (!currentUser.empresa_id) return null;
    return zonasEmpresa.find((zona) => zona.empresa_id === currentUser.empresa_id && zona.estado === 'activa') || null;
  }, [currentUser.empresa_id, zonasEmpresa]);

  const limitarPosicionAZonaPropia = useCallback((x: number, z: number) => {
    const zonaPropia = obtenerZonaPropiaActiva();
    if (!zonaPropia) {
      return { x, z };
    }

    const centroX = Number(zonaPropia.posicion_x) / 16;
    const centroZ = Number(zonaPropia.posicion_y) / 16;
    const halfW = Math.max((Number(zonaPropia.ancho) / 16) / 2, 0.35);
    const halfH = Math.max((Number(zonaPropia.alto) / 16) / 2, 0.35);
    const padding = THREE.MathUtils.clamp(Math.min(halfW, halfH) * 0.18, 0.08, 0.22);
    const minX = centroX - Math.max(halfW - padding, 0.1);
    const maxX = centroX + Math.max(halfW - padding, 0.1);
    const minZ = centroZ - Math.max(halfH - padding, 0.1);
    const maxZ = centroZ + Math.max(halfH - padding, 0.1);

    return {
      x: THREE.MathUtils.clamp(x, minX, maxX),
      z: THREE.MathUtils.clamp(z, minZ, maxZ),
    };
  }, [obtenerZonaPropiaActiva]);

  const obtenerPosicionSpawnEmpresa = useCallback(() => {
    const zonaPropia = obtenerZonaPropiaActiva();
    if (!zonaPropia) return null;

    if (Number(zonaPropia.spawn_x) !== 0 || Number(zonaPropia.spawn_y) !== 0) {
      return limitarPosicionAZonaPropia(Number(zonaPropia.spawn_x) / 16, Number(zonaPropia.spawn_y) / 16);
    }

    return limitarPosicionAZonaPropia(Number(zonaPropia.posicion_x) / 16, Number(zonaPropia.posicion_y) / 16);
  }, [limitarPosicionAZonaPropia, obtenerZonaPropiaActiva]);

  const resolverAsientoPersistido = useCallback((x: number, z: number) => {
    let mejorAsiento: AsientoRuntime3D | null = null;
    let mejorDistancia = Number.POSITIVE_INFINITY;

    for (const asiento of asientos) {
      const ocupacion = asiento.objetoId ? ocupacionesAsientosPorObjetoId.get(asiento.objetoId) : null;
      if (ocupacion && ocupacion.usuario_id !== currentUser.id) {
        continue;
      }

      const distancia = Math.hypot(asiento.posicion.x - x, asiento.posicion.z - z);
      const radioRestauracion = Math.max(0.12, Math.min(asiento.radioCaptura, 0.3));
      if (distancia <= radioRestauracion && distancia < mejorDistancia) {
        mejorAsiento = asiento;
        mejorDistancia = distancia;
      }
    }

    return mejorAsiento;
  }, [asientos, currentUser.id, ocupacionesAsientosPorObjetoId]);

  const initialPosition = useMemo(() => {
    const ecsData = ecsStateRef?.current ? obtenerEstadoUsuarioEcs(ecsStateRef.current, currentUser.id) : null;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 2000) {
      return limitarPosicionAZonaPropia(ecsData.x, ecsData.z);
    }

    if (spawnPersonal.spawn_x != null && spawnPersonal.spawn_z != null) {
      return limitarPosicionAZonaPropia(spawnPersonal.spawn_x, spawnPersonal.spawn_z);
    }

    const spawnEmpresa = obtenerPosicionSpawnEmpresa();
    if (spawnEmpresa) {
      return spawnEmpresa;
    }

    return limitarPosicionAZonaPropia((currentUser.x || 400) / 16, (currentUser.y || 400) / 16);
  }, [currentUser.id, currentUser.x, currentUser.y, ecsStateRef, limitarPosicionAZonaPropia, obtenerPosicionSpawnEmpresa, spawnPersonal.spawn_x, spawnPersonal.spawn_z]);
  const initialDirection = useMemo(() => {
    const ecsData = ecsStateRef?.current ? obtenerEstadoUsuarioEcs(ecsStateRef.current, currentUser.id) : null;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 2000) {
      return ecsData.direction ?? 'front';
    }
    return currentUser.direction ?? 'front';
  }, [currentUser.direction, currentUser.id, ecsStateRef]);
  const asientoInicialPersistido = useMemo(() => {
    return resolverAsientoPersistido(initialPosition.x, initialPosition.z);
  }, [initialPosition.x, initialPosition.z, resolverAsientoPersistido]);
  const positionRef = useRef(asientoInicialPersistido
    ? { x: asientoInicialPersistido.posicion.x, z: asientoInicialPersistido.posicion.z }
    : { ...initialPosition });
  const posicionInicialFallbackRef = useRef(asientoInicialPersistido
    ? { x: asientoInicialPersistido.posicion.x, z: asientoInicialPersistido.posicion.z }
    : { ...initialPosition });
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const animationStateRef = useRef<AnimationState>('idle');
  const baseAnimationStateRef = useRef<AnimationState>('idle');
  
  const [direction, setDirection] = useState<string>(initialDirection);
  const directionRef = useRef<string>(initialDirection);
  // PR-1: isRunning como ref + state para evitar re-renders en useFrame.
  // La lectura DENTRO de useFrame usa isRunningRef.current (sin captura de stale closure).
  // setIsRunning solo actualiza la UI en el raro caso de cambio shift on/off.
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);
  
  const [isSitting, setIsSitting] = useState(!!asientoInicialPersistido);

  // === SISTEMA DE ANIMACIONES CONTEXTUALES ===
  const [contextualAnim, setContextualAnim] = useState<AnimationState | null>(asientoInicialPersistido ? 'sit' : null);
  const contextualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seatTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seatApproachStartedAtRef = useRef<number | null>(null);
  const seatApproachOriginRef = useRef<{ x: number; z: number } | null>(null);
  const seatApproachDurationMsRef = useRef<number>(ANIMATION_SIT_DOWN_DURATION);
  const seatCaptureCooldownUntilRef = useRef<number>(0);
  const seatCaptureCooldownSeatIdRef = useRef<string | null>(null);
  const lastSitDebugKeyRef = useRef<string>('');
  const previousUsersInCallRef = useRef<Set<string>>(new Set());
  const wavedToUsersRef = useRef<Set<string>>(new Set());
  const [seatRuntime, setSeatRuntime] = useState<AsientoRuntime3D | null>(asientoInicialPersistido);
  const avatarHeightRef = useRef<number>(ALTURA_AVATAR_ESTANDAR);
  const avatarHipHeightRef = useRef<number>(ALTURA_AVATAR_ESTANDAR * 0.53);
  const avatarSitHipHeightRef = useRef<number | null>(null);
  const ultimaPosicionPersistidaRef = useRef<{ x: number; z: number } | null>(null);
  const ultimoGuardadoPosicionRef = useRef(0);

  const persistirPosicion = useCallback((x: number, z: number, forzar = false) => {
    if (!onGuardarPosicionPersistente) return;

    const posicionLimitada = limitarPosicionAZonaPropia(x, z);
    const ultima = ultimaPosicionPersistidaRef.current;
    const ahora = Date.now();
    const cambioSuficiente = !ultima
      || Math.abs(ultima.x - posicionLimitada.x) > 0.35
      || Math.abs(ultima.z - posicionLimitada.z) > 0.35;
    const cooldownCumplido = ahora - ultimoGuardadoPosicionRef.current >= 2500;

    if (!forzar && (!cambioSuficiente || !cooldownCumplido)) {
      return;
    }

    ultimaPosicionPersistidaRef.current = posicionLimitada;
    ultimoGuardadoPosicionRef.current = ahora;
    void onGuardarPosicionPersistente(posicionLimitada.x, posicionLimitada.z);
  }, [limitarPosicionAZonaPropia, onGuardarPosicionPersistente]);

  const sincronizarPosicionInicial = useCallback((posicionBase: { x: number; z: number }, forzarPersistencia = false) => {
    const posicionInicialFallback = posicionInicialFallbackRef.current;
    const sigueEnFallback = Math.abs(positionRef.current.x - posicionInicialFallback.x) < 0.01
      && Math.abs(positionRef.current.z - posicionInicialFallback.z) < 0.01;

    if (!sigueEnFallback) return;

    ultimaPosicionPersistidaRef.current = posicionBase;
    const asientoPersistido = resolverAsientoPersistido(posicionBase.x, posicionBase.z);
    const nextX = asientoPersistido ? asientoPersistido.posicion.x : posicionBase.x;
    const nextZ = asientoPersistido ? asientoPersistido.posicion.z : posicionBase.z;

    positionRef.current.x = nextX;
    positionRef.current.z = nextZ;

    if (groupRef.current) {
      groupRef.current.position.x = nextX;
      groupRef.current.position.z = nextZ;
    }

    setSeatRuntime(asientoPersistido);
    setContextualAnim(asientoPersistido ? 'sit' : null);
    setIsSitting(!!asientoPersistido);

    (camera as any).userData.playerPosition = { x: nextX, z: nextZ };
    onPositionUpdate?.(nextX, nextZ);
    setPosition(nextX * 16, nextZ * 16, directionRef.current, !!asientoPersistido, false);
    broadcastMovement?.(nextX * 16, nextZ * 16, directionRef.current, false, asientoPersistido ? 'sit' : animationStateRef.current, true);

    if (forzarPersistencia) {
      persistirPosicion(nextX, nextZ, true);
    }
  }, [broadcastMovement, camera, onPositionUpdate, persistirPosicion, resolverAsientoPersistido, setPosition]);

  useEffect(() => {
    if (spawnPersonal.spawn_x == null || spawnPersonal.spawn_z == null) return;

    const posicionPersistida = limitarPosicionAZonaPropia(spawnPersonal.spawn_x, spawnPersonal.spawn_z);
    const spawnFueraDeZona = Math.abs(posicionPersistida.x - spawnPersonal.spawn_x) > 0.01
      || Math.abs(posicionPersistida.z - spawnPersonal.spawn_z) > 0.01;
    sincronizarPosicionInicial(posicionPersistida, spawnFueraDeZona);
  }, [limitarPosicionAZonaPropia, sincronizarPosicionInicial, spawnPersonal.spawn_x, spawnPersonal.spawn_z]);

  useEffect(() => {
    if (spawnPersonal.spawn_x != null || spawnPersonal.spawn_z != null) return;

    const spawnEmpresa = obtenerPosicionSpawnEmpresa();
    if (!spawnEmpresa) return;

    const posicionActualBase = {
      x: (currentUser.x || 400) / 16,
      z: (currentUser.y || 400) / 16,
    };
    const posicionActualLimitada = limitarPosicionAZonaPropia(posicionActualBase.x, posicionActualBase.z);
    const estabaFueraDeZona = Math.abs(posicionActualBase.x - posicionActualLimitada.x) > 0.01
      || Math.abs(posicionActualBase.z - posicionActualLimitada.z) > 0.01;

    sincronizarPosicionInicial(spawnEmpresa, estabaFueraDeZona || !ultimaPosicionPersistidaRef.current);
  }, [currentUser.x, currentUser.y, limitarPosicionAZonaPropia, obtenerPosicionSpawnEmpresa, sincronizarPosicionInicial, spawnPersonal.spawn_x, spawnPersonal.spawn_z]);

  useEffect(() => {
    seatRuntimeRef.current = seatRuntime;
  }, [seatRuntime]);

  useEffect(() => {
    baseAnimationStateRef.current = animationState;
  }, [animationState]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  const actualizarAnimationStateBase = useCallback((proximoEstado: AnimationState) => {
    if (baseAnimationStateRef.current === proximoEstado) return;
    baseAnimationStateRef.current = proximoEstado;
    setAnimationState(proximoEstado);
  }, []);

  const actualizarDirectionVisual = useCallback((proximaDireccion: string) => {
    if (directionRef.current === proximaDireccion) return;
    directionRef.current = proximaDireccion;
    setDirection(proximaDireccion);
  }, []);

  const asientoOcupadoPorOtroUsuario = useCallback((asiento: AsientoRuntime3D | null) => {
    if (!asiento?.objetoId) return false;
    const ocupacion = ocupacionesAsientosRef.current.get(asiento.objetoId);
    return !!ocupacion && ocupacion.usuario_id !== currentUser.id;
  }, [currentUser.id]);

  const logSitDebug = useCallback((fase: string, payload: Record<string, unknown>) => {
    const debugKey = `${fase}:${JSON.stringify(payload)}`;
    if (lastSitDebugKeyRef.current === debugKey) return;
    lastSitDebugKeyRef.current = debugKey;
    // P2 (2026-04-10): diagnóstico de posicionamiento al sentarse — debug-level
    log.debug('SIT_DEBUG[player]', { fase, ...payload });
  }, []);

  const handleAvatarHeightComputed = useCallback((height: number) => {
    if (height > 0.1) {
      avatarHeightRef.current = height;
    }
  }, []);

  const handleMetricasAvatarComputadas = useCallback((metricas: { altura: number; alturaCadera: number; alturaCaderaSentada?: number }) => {
    if (metricas.altura > 0.1) {
      avatarHeightRef.current = metricas.altura;
    }
    if (metricas.alturaCadera > 0.1) {
      avatarHipHeightRef.current = metricas.alturaCadera;
    }
    if (metricas.alturaCaderaSentada != null && metricas.alturaCaderaSentada > 0.1) {
      avatarSitHipHeightRef.current = metricas.alturaCaderaSentada;
      log.debug('SIT_DEBUG[player] pelvis_sentada_recibida', {
        alturaCaderaSentada: Number(metricas.alturaCaderaSentada.toFixed(4)),
      });
    }
  }, []);

  const obtenerOffsetVerticalSentado = useCallback((asiento: AsientoRuntime3D | null) => {
    if (!asiento) return 0;
    // Correction: hip bone is at the center of the pelvis, but the avatar's
    // butt/thighs contact the cushion ~0.08m below the bone center.
    const correccionContactoCojin = 0.08;
    if (avatarSitHipHeightRef.current != null) {
      return asiento.posicion.y - avatarSitHipHeightRef.current - correccionContactoCojin;
    }
    const alturaAvatar = THREE.MathUtils.clamp(avatarHeightRef.current || ALTURA_AVATAR_ESTANDAR, 1.2, 2.4);
    const factorPelvis = asiento.perfil.factorCaderaSentada * 0.53;
    const pelvisEstimada = alturaAvatar * factorPelvis;
    return asiento.posicion.y - pelvisEstimada - correccionContactoCojin;
  }, []);

  const reservarAsientoPersistente = useCallback(async (asiento: AsientoRuntime3D) => {
    if (!asiento.objetoId || !onOcuparAsiento) return true;
    if (asientoOcupadoPorOtroUsuario(asiento)) return false;

    const ocupacionActual = ocupacionesAsientosRef.current.get(asiento.objetoId);
    if (ocupacionActual?.usuario_id === currentUser.id) return true;
    if (reservaAsientoEnCursoRef.current === asiento.id) return false;

    reservaAsientoEnCursoRef.current = asiento.id;
    try {
      return await onOcuparAsiento(asiento);
    } finally {
      reservaAsientoEnCursoRef.current = null;
    }
  }, [asientoOcupadoPorOtroUsuario, currentUser.id, onOcuparAsiento]);

  // Auto-wave: detectar nuevos usuarios que entran en proximidad
  useEffect(() => {
    if (!usersInCallIds || usersInCallIds.size === 0) {
      previousUsersInCallRef.current = new Set();
      return;
    }
    const prev = previousUsersInCallRef.current;
    const newEntries: string[] = [];
    usersInCallIds.forEach(id => {
      if (!prev.has(id) && !wavedToUsersRef.current.has(id)) {
        newEntries.push(id);
        wavedToUsersRef.current.add(id);
      }
    });
    previousUsersInCallRef.current = new Set(usersInCallIds);

    // Si hay nuevos usuarios y no estamos en movimiento → wave
    if (newEntries.length > 0 && animationStateRef.current !== 'walk' && animationStateRef.current !== 'run') {
      setContextualAnim('wave');
      // XP por saludo automático (throttle 30s)
      onXPEvent?.('saludo_wave', 30000);
      if (contextualTimerRef.current) clearTimeout(contextualTimerRef.current);
      contextualTimerRef.current = setTimeout(() => {
        setContextualAnim(null);
      }, 3000);
    }
    return () => {
      if (contextualTimerRef.current) clearTimeout(contextualTimerRef.current);
    };
  }, [usersInCallIds]);

  // --- VECTORES REUTILIZABLES (Estabilidad v2.2) ---
  const camForwardVec = useMemo(() => new THREE.Vector3(), []);
  const camRightVec = useMemo(() => new THREE.Vector3(), []);
  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const moveVec = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!seatRuntime) {
      if (isSitting) {
        setIsSitting(false);
      }
      seatApproachStartedAtRef.current = null;
      seatApproachOriginRef.current = null;
      seatApproachDurationMsRef.current = ANIMATION_SIT_DOWN_DURATION;
      return;
    }

    if (contextualAnim === 'sit' || contextualAnim === 'sit_down') {
      if (contextualAnim === 'sit_down' && seatApproachStartedAtRef.current === null) {
        seatApproachStartedAtRef.current = performance.now();
        seatApproachOriginRef.current = {
          x: positionRef.current.x,
          z: positionRef.current.z,
        };
      }
      setIsSitting(true);
      return;
    }

    if (contextualAnim === 'stand_up') {
      seatApproachStartedAtRef.current = null;
      seatApproachOriginRef.current = null;
      seatApproachDurationMsRef.current = ANIMATION_SIT_DOWN_DURATION;
      avatarSitHipHeightRef.current = null;
      setIsSitting(false);
    }
  }, [contextualAnim, isSitting, seatRuntime]);

  // Fase 2: Sit contextual — sentarse automáticamente al estar idle cerca de una silla
  // Extracted to useSeatDetection hook for maintainability.
  useSeatDetection({
    animationStateRef,
    contextualAnim,
    positionRef,
    asientosRef,
    seatCaptureCooldownSeatIdRef,
    seatCaptureCooldownUntilRef,
    seatApproachDurationMsRef,
    seatTransitionTimerRef,
    asientoOcupadoPorOtroUsuario,
    reservarAsientoPersistente,
    logSitDebug,
    setSeatRuntime,
    setContextualAnim,
    obtenerOffsetVerticalSentado,
  });

  useEffect(() => {
    return () => {
      if (seatTransitionTimerRef.current) clearTimeout(seatTransitionTimerRef.current);
      persistirPosicion(positionRef.current.x, positionRef.current.z, true);
      if (seatRuntimeRef.current) {
        void onLiberarAsiento?.(seatRuntimeRef.current);
      }
    };
  }, [onLiberarAsiento, persistirPosicion]);

  // Fase 3: Reacciones desde chat — detectar emojis en mensajes y disparar animación
  const prevMessageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!message || message === prevMessageRef.current) return;
    prevMessageRef.current = message;
    const EMOJI_ANIM_MAP: [RegExp, AnimationState][] = [
      [/👋|🤚|✋/, 'wave'],
      [/🎉|🥳|🎊/, 'cheer'],
      [/💃|🕺|🪩/, 'dance'],
      [/🏆|🥇|✌️/, 'victory'],
      [/🦘|⬆️|🚀/, 'jump'],
    ];
    for (const [pattern, anim] of EMOJI_ANIM_MAP) {
      if (pattern.test(message)) {
        setContextualAnim(anim);
        if (contextualTimerRef.current) clearTimeout(contextualTimerRef.current);
        contextualTimerRef.current = setTimeout(() => setContextualAnim(null), 3000);
        break;
      }
    }
  }, [message]);

  // Cancelar animación contextual si el usuario se mueve
  useEffect(() => {
    if ((animationState === 'walk' || animationState === 'run') && contextualAnim) {
      setContextualAnim(null);
      if (contextualTimerRef.current) clearTimeout(contextualTimerRef.current);
    }
  }, [animationState, contextualAnim]);

  // Estado efectivo: contextual > keyboard
  const effectiveAnimState = contextualAnim || animationState;
  // PR-1: Ref para que useFrame lea effectiveAnimState sin capturar el closure stale.
  // Se actualiza sincrónicamente cuando cualquiera de sus fuentes cambia.
  const effectiveAnimStateRef = useRef<AnimationState>(effectiveAnimState);
  effectiveAnimStateRef.current = effectiveAnimState;

  useEffect(() => {
    if (!seatRuntime || !esAnimacionAsiento(effectiveAnimState) || !seatRuntime.objetoId || !onRefrescarAsiento) return;

    void onRefrescarAsiento(seatRuntime);
    const interval = setInterval(() => {
      void onRefrescarAsiento(seatRuntime);
    }, 15000);

    return () => clearInterval(interval);
  }, [effectiveAnimState, onRefrescarAsiento, seatRuntime]);

  const levantandoseRef = useRef<number>(0);
  const sitDownStartTimeRef = useRef<number>(0);

  // Sincronizar ref con state
  useEffect(() => {
    animationStateRef.current = effectiveAnimState;
    if (effectiveAnimState === 'stand_up') {
      levantandoseRef.current = Date.now();
    }
  }, [effectiveAnimState]);
  const keysPressed = useRef<Set<string>>(new Set());
  const lastSyncTime = useRef(0);
  const lastBroadcastTime = useRef(0);
  const autoMoveTimeRef = useRef(0);
  const estabaMoviendoseRef = useRef(false);
  const lastBroadcastRef = useRef<{ x: number; y: number; direction: string; isMoving: boolean; animState?: string } | null>(null);

  // Welcome broadcast: when a new peer joins the LiveKit room, reset the
  // broadcast timer so the next frame's idle heartbeat fires immediately,
  // exposing our current position without waiting the full 2s tick.
  const participantJoinVersion = useStore((s) => s.participantJoinVersion);
  useEffect(() => {
    lastBroadcastTime.current = 0;
  }, [participantJoinVersion]);

  // Teletransportación
  const [teleportPhase, setTeleportPhase] = useState<'none' | 'out' | 'in'>('none');
  const [teleportOrigin, setTeleportOrigin] = useState<[number, number, number] | null>(null);
  const [teleportDest, setTeleportDest] = useState<[number, number, number] | null>(null);
  const teleportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manejar teleport cuando llega un teleportTarget
  useEffect(() => {
    if (!teleportTarget) return;

    const originPos: [number, number, number] = [positionRef.current.x, 0, positionRef.current.z];
    const destPos: [number, number, number] = [teleportTarget.x, 0, teleportTarget.z];

    // Fase 1: Desaparición
    setTeleportOrigin(originPos);
    setTeleportDest(destPos);
    setTeleportPhase('out');
    // Plan 328c3152 #5: migrado al port ISoundBus del container.
    // Nota: el port no expone sourceId ni listenerPosition por ahora; si se
    // necesitan en el futuro, extender `PlaySoundOptions` del port.
    getApplicationServices().sounds.play('teleport', {
      posicion: { x: originPos[0], z: originPos[2] },
    });

    // Fase 2: Mover al destino después de 300ms
    teleportTimerRef.current = setTimeout(() => {
      positionRef.current.x = teleportTarget.x;
      positionRef.current.z = teleportTarget.z;
      if (groupRef.current) {
        groupRef.current.position.x = teleportTarget.x;
        groupRef.current.position.z = teleportTarget.z;
      }
      // Sincronizar posición inmediatamente
      setPosition(teleportTarget.x * 16, teleportTarget.z * 16, 'front', false, false);
      (camera as any).userData.playerPosition = { x: teleportTarget.x, z: teleportTarget.z };
      persistirPosicion(teleportTarget.x, teleportTarget.z, true);

      setTeleportPhase('in');

      // Fase 3: Limpiar efecto
      setTimeout(() => {
        setTeleportPhase('none');
        setTeleportOrigin(null);
        setTeleportDest(null);
        if (onTeleportDone) onTeleportDone();
        // XP por teleport (throttle 5s)
        onXPEvent?.('teleport', 5000);
      }, 400);
    }, 300);

    return () => {
      if (teleportTimerRef.current) clearTimeout(teleportTimerRef.current);
    };
  }, [persistirPosicion, teleportTarget]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
      if (isTyping) return;

      keysPressed.current.add(e.code);

      // PR-1: Shift — actualizar ref PRIMERO (sin re-render), luego state solo para UI
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isRunningRef.current = true;
        setIsRunning(true);
      }

      // Teclas de acción especiales (dance/cheer manuales, sit es contextual)
      if (e.code === 'KeyE') actualizarAnimationStateBase('cheer');
      if (e.code === 'KeyQ') actualizarAnimationStateBase('dance');

      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);

      // PR-1: Ref primero, setState solo para UI
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isRunningRef.current = false;
        setIsRunning(false);
      }

      // Volver a idle cuando se sueltan teclas de acción
      if (['KeyE', 'KeyQ'].includes(e.code)) {
        actualizarAnimationStateBase('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Detectar cuándo se levanta para ignorar colisiones temporalmente
  useEffect(() => {
    if (effectiveAnimState === 'stand_up') {
      levantandoseRef.current = Date.now();
    }
  }, [effectiveAnimState]);

  // Prioridad -2: Player ejecuta PRIMERO → escribe userData.playerPosition
  useFrame((state, delta) => {
    let dx = 0, dy = 0;
    const direccionActual = directionRef.current;
    let newDirection = direccionActual;
    const previousX = positionRef.current.x;
    const previousZ = positionRef.current.z;
    let movedThisFrame = false;

    // PR-1: Leer isRunningRef.current en lugar de la variable de closure 'isRunning'
    // Evita el problema de stale closure donde el frame captura el valor de isRunning
    // al momento de montaje, no el valor actual.
    const baseMoveSpeed = moveSpeed ?? MOVE_SPEED;
    const baseRunSpeed = runSpeed ?? RUN_SPEED;
    const speed = isRunningRef.current ? baseRunSpeed : baseMoveSpeed;

    // Movimiento por teclado
    const keyW = keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp');
    const keyS = keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown');
    const keyA = keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft');
    const keyD = keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight');
    const hasKeyboardInput = keyW || keyS || keyA || keyD;

    // Movimiento por joystick mobile (solo si no hay input de teclado)
    const joystick = mobileInputRef?.current;
    const hasJoystickInput = !hasKeyboardInput && joystick && joystick.active && joystick.magnitude > 0;

    const currentSeatRuntime = seatRuntimeRef.current;
    // PR-1: Usar effectiveAnimStateRef.current en lugar de effectiveAnimState (closure stale)
    const effectiveAnimFrame = effectiveAnimStateRef.current;
    const seatImmobilized = !!currentSeatRuntime && (effectiveAnimFrame === 'sit' || effectiveAnimFrame === 'sit_down');
    const seatLocked = !!currentSeatRuntime && (effectiveAnimFrame === 'sit' || effectiveAnimFrame === 'sit_down');

    // If seated and only trigger is a moveTarget near the seat, consume it — don't stand up
    let moveTargetConsumed = false;
    if (seatLocked && moveTarget && !hasKeyboardInput && !hasJoystickInput) {
      const distMoveToSeat = Math.hypot(
        moveTarget.x - currentSeatRuntime.posicion.x,
        moveTarget.z - currentSeatRuntime.posicion.z
      );
      if (distMoveToSeat < currentSeatRuntime.radioCaptura + 0.3) {
        if (onReachTarget) onReachTarget();
        moveTargetConsumed = true;
      }
    }

    if (seatLocked && (hasKeyboardInput || hasJoystickInput || (moveTarget && !moveTargetConsumed))) {
      if (seatTransitionTimerRef.current) clearTimeout(seatTransitionTimerRef.current);
      const obstaculoAsiento = currentSeatRuntime.obstaculoId
        ? obstaculosRef.current.find((item) => item.id === currentSeatRuntime.obstaculoId)
        : null;
      const salidaDistancia = obstaculoAsiento
        ? obstaculoAsiento.semiextensiones.z + obstaculoAsiento.padding + RADIO_COLISION_AVATAR + 0.12
        : RADIO_COLISION_AVATAR + 0.28;
      const salidaX = currentSeatRuntime.posicion.x + Math.sin(currentSeatRuntime.rotacion) * salidaDistancia;
      const salidaZ = currentSeatRuntime.posicion.z + Math.cos(currentSeatRuntime.rotacion) * salidaDistancia;
      logSitDebug('stand_up', {
        asientoId: currentSeatRuntime.id,
        animacion: effectiveAnimState,
        salida: {
          x: Number(salidaX.toFixed(3)),
          z: Number(salidaZ.toFixed(3)),
          distancia: Number(salidaDistancia.toFixed(3)),
        },
      });
      seatCaptureCooldownSeatIdRef.current = currentSeatRuntime.id;
      seatCaptureCooldownUntilRef.current = performance.now() + 1400;
      levantandoseRef.current = Date.now();
      positionRef.current.x = salidaX;
      positionRef.current.z = salidaZ;
      void onLiberarAsiento?.(currentSeatRuntime);
      setContextualAnim('stand_up');
      setIsSitting(false);
      avatarSitHipHeightRef.current = null;
      seatApproachStartedAtRef.current = null;
      seatApproachOriginRef.current = null;
      seatApproachDurationMsRef.current = ANIMATION_SIT_DOWN_DURATION;
      seatTransitionTimerRef.current = setTimeout(() => {
        setContextualAnim(null);
        setSeatRuntime(null);
      }, 500);
    }

    if (seatImmobilized && currentSeatRuntime) {
      if (effectiveAnimState === 'sit_down' && seatApproachOriginRef.current && seatApproachStartedAtRef.current !== null) {
        const elapsed = performance.now() - seatApproachStartedAtRef.current;
        const duration = seatApproachDurationMsRef.current;
        const rawT = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
        // easeInOutCubic for fluid approach
        const t = rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const ox = seatApproachOriginRef.current.x;
        const oz = seatApproachOriginRef.current.z;
        positionRef.current.x = ox + (currentSeatRuntime.posicion.x - ox) * t;
        positionRef.current.z = oz + (currentSeatRuntime.posicion.z - oz) * t;
      } else {
        const seatFollow = 1 - Math.pow(1 - 0.22, delta * 60);
        positionRef.current.x = THREE.MathUtils.lerp(positionRef.current.x, currentSeatRuntime.posicion.x, seatFollow);
        positionRef.current.z = THREE.MathUtils.lerp(positionRef.current.z, currentSeatRuntime.posicion.z, seatFollow);
      }
      dx = 0;
      dy = 0;
    }

    // Función auxiliar para verificar colisión con zonas prohibidas
    const isPositionValid = (x: number, z: number) => {
      // Si está sentado o levantándose, ignorar colisiones con objetos para evitar quedar atrapado
      const anim = animationStateRef.current;
      const isGraceActive = (Date.now() - levantandoseRef.current) < STAND_UP_GRACE_PERIOD;
      if (anim === 'sit' || anim === 'sit_down' || anim === 'stand_up' || isGraceActive) {
        return true;
      }

      // 1. Verificar colisión con Zonas de Empresa (Muros invisibles)
      const zonas = zonasRef.current;
      const auth = empresasAuthRef.current;
      const myEmpresa = currentUser.empresa_id;

      for (const zona of zonas) {
        if (zona.estado !== 'activa') continue;
        if (zona.es_comun) continue;
        if (myEmpresa && zona.empresa_id === myEmpresa) continue;
        if (zona.empresa_id && auth.includes(zona.empresa_id)) continue;

        const zX = Number(zona.posicion_x) / 16;
        const zZ = Number(zona.posicion_y) / 16;
        const halfW = (Number(zona.ancho) / 16) / 2;
        const halfH = (Number(zona.alto) / 16) / 2;
        const padding = 0.2;

        if (x > zX - halfW - padding && x < zX + halfW + padding &&
          z > zZ - halfH - padding && z < zZ + halfH + padding) {
          return false;
        }
      }

      const idsIgnorados = currentSeatRuntime?.obstaculoId ? [currentSeatRuntime.obstaculoId] : [];
      return esPosicionTransitable({ x, z }, obstaculosRef.current, 0.42, idsIgnorados);
    };

    // ── LÓGICA DE MOVIMIENTO (Estabilidad v2.2) ──
    // PR-1: Leer isRunningRef.current (no el closure stale de isRunning)
    const shouldRun = hasKeyboardInput ? isRunningRef.current : (hasJoystickInput && joystick?.isRunning);

    if (hasKeyboardInput) {
      if (moveTarget && onReachTarget) { autoMoveTimeRef.current = 0; onReachTarget(); }

      // ── Movimiento Relativo a la Cámara (Camera-Relative) ──
      // 1. Obtener orientación de la cámara proyectada en el plano XZ
      state.camera.getWorldDirection(camForwardVec);
      camForwardVec.y = 0;
      camForwardVec.normalize();

      // 2. Calcular vector derecho (right)
      camRightVec.crossVectors(camForwardVec, upVec).normalize();

      // 3. Construir vector de movimiento basado en input
      moveVec.set(0, 0, 0);
      if (keyW) moveVec.add(camForwardVec);
      if (keyS) moveVec.sub(camForwardVec);
      if (keyA) moveVec.sub(camRightVec);
      if (keyD) moveVec.add(camRightVec);

      if (moveVec.lengthSq() > 0) {
        moveVec.normalize();

        // Transformar vector mundo a incrementos dx/dy (donde dy es Z mundo)
        dx = moveVec.x * speed * delta;
        // nextZ = z - dy, por lo que dy = -moveVec.z
        dy = -moveVec.z * speed * delta;
      }
    } else if (hasJoystickInput && joystick) {
      if (moveTarget && onReachTarget) { autoMoveTimeRef.current = 0; onReachTarget(); }

      // ── Joystick Relativo a la Cámara ──
      state.camera.getWorldDirection(camForwardVec);
      camForwardVec.y = 0;
      camForwardVec.normalize();
      camRightVec.crossVectors(camForwardVec, upVec).normalize();

      moveVec.set(0, 0, 0);
      const jx = joystick.dx || 0;
      const jz = joystick.dz || 0;
      moveVec.addScaledVector(camRightVec, jx);
      moveVec.addScaledVector(camForwardVec, -jz);

      if (moveVec.lengthSq() > 0.01) {
        const joySpeed = joystick.isRunning ? baseRunSpeed : (baseMoveSpeed * joystick.magnitude);
        dx = moveVec.x * joySpeed * delta;
        dy = -moveVec.z * joySpeed * delta;
      }
    } else if (!seatImmobilized && moveTarget) {
      const tx = moveTarget.x, tz = moveTarget.z;
      const cx = positionRef.current.x, cz = positionRef.current.z;
      const distX = tx - cx, distZ = tz - cz;
      const dist = Math.sqrt(distX * distX + distZ * distZ);

      if (dist < 0.15) {
        autoMoveTimeRef.current = 0;
        if (onReachTarget) onReachTarget();
      } else {
        autoMoveTimeRef.current += delta;
        const isAutoRunning = autoMoveTimeRef.current > 0.4;
        const autoSpeed = isAutoRunning ? baseRunSpeed : baseMoveSpeed;
        const step = Math.min(autoSpeed * delta, dist);
        const movimientoAuto = resolverMovimientoConDeslizamiento({
          posicionActual: positionRef.current,
          movimiento: {
            dx: (distX / dist) * step,
            dz: (distZ / dist) * step,
          },
          worldSize: WORLD_SIZE,
          esPosicionValida: isPositionValid,
        });
        positionRef.current.x = movimientoAuto.posicion.x;
        positionRef.current.z = movimientoAuto.posicion.z;
        movedThisFrame = movimientoAuto.seMovio;
        if (['idle', 'walk', 'run'].includes(baseAnimationStateRef.current)) {
          actualizarAnimationStateBase(isAutoRunning ? 'run' : 'walk');
        }
      }
    }

    const movingByDirectInput = dx !== 0 || dy !== 0;
    if (movingByDirectInput) {
      const movimientoResuelto = resolverMovimientoConDeslizamiento({
        posicionActual: positionRef.current,
        movimiento: { dx, dz: -dy },
        worldSize: WORLD_SIZE,
        esPosicionValida: isPositionValid,
      });
      positionRef.current.x = movimientoResuelto.posicion.x;
      positionRef.current.z = movimientoResuelto.posicion.z;
      movedThisFrame = movimientoResuelto.seMovio;
      actualizarAnimationStateBase(shouldRun ? 'run' : 'walk');
    }

    const deltaMovimientoX = positionRef.current.x - previousX;
    const deltaMovimientoZ = positionRef.current.z - previousZ;
    const huboMovimientoReal = Math.abs(deltaMovimientoX) > 0.0001 || Math.abs(deltaMovimientoZ) > 0.0001;

    if (huboMovimientoReal) {
      newDirection = obtenerDireccionDesdeVector(deltaMovimientoX, deltaMovimientoZ, direccionActual as DireccionAvatar);
      persistirPosicion(positionRef.current.x, positionRef.current.z);
    }

    const moving = !seatImmobilized && (movedThisFrame || huboMovimientoReal);
    if (estabaMoviendoseRef.current && !moving) {
      persistirPosicion(positionRef.current.x, positionRef.current.z, true);
    }
    estabaMoviendoseRef.current = moving;

    if (!moving && (baseAnimationStateRef.current === 'walk' || baseAnimationStateRef.current === 'run')) {
      actualizarAnimationStateBase('idle');
    }

    if (newDirection !== direccionActual) actualizarDirectionVisual(newDirection);

    if (groupRef.current) {
      groupRef.current.position.x = positionRef.current.x;
      groupRef.current.position.z = positionRef.current.z;
      const sentadoActivo = !!currentSeatRuntime && (effectiveAnimFrame === 'sit' || effectiveAnimFrame === 'sit_down');
      const targetY = sentadoActivo && currentSeatRuntime
        ? obtenerOffsetVerticalSentado(currentSeatRuntime)
        : 0;
      if (sentadoActivo && currentSeatRuntime && sitDownStartTimeRef.current === 0) {
        sitDownStartTimeRef.current = Date.now();
      }
      if (sentadoActivo && currentSeatRuntime && (Date.now() - sitDownStartTimeRef.current) < 3000 && (Date.now() - sitDownStartTimeRef.current) % 500 < 20) {
        log.debug('SIT_Y_DEBUG', {
          seatPosY: +currentSeatRuntime.posicion.y.toFixed(4),
          targetY: +targetY.toFixed(4),
          currentGroupY: +groupRef.current.position.y.toFixed(4),
          avatarHeight: +avatarHeightRef.current.toFixed(4),
          avatarHipHeight: +avatarHipHeightRef.current.toFixed(4),
          avatarSitHipHeight: avatarSitHipHeightRef.current != null ? +avatarSitHipHeightRef.current.toFixed(4) : null,
          pelvisEstimada: +(THREE.MathUtils.clamp(avatarHeightRef.current || 1.75, 1.2, 2.4) * 0.30).toFixed(4),
          effectiveAnim: effectiveAnimState,
        });
      }
      if (!sentadoActivo) sitDownStartTimeRef.current = 0;

      // During sit_down approach, sync Y and rotation with the same eased curve as XZ
      const isSitDownApproach = effectiveAnimFrame === 'sit_down' && seatApproachStartedAtRef.current !== null;
      if (isSitDownApproach) {
        const elapsed = performance.now() - seatApproachStartedAtRef.current!;
        const duration = seatApproachDurationMsRef.current;
        const rawT = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
        // easeInOutQuart — slower start, smooth middle, gentle landing
        const tY = rawT < 0.5
          ? 8 * rawT * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 4) / 2;
        const originY = groupRef.current.position.y === 0 ? 0 : groupRef.current.position.y;
        // Only start descending after 30% of approach (walk first, then lower)
        const tYDelayed = THREE.MathUtils.clamp((rawT - 0.3) / 0.7, 0, 1);
        const tYEased = tYDelayed < 0.5
          ? 2 * tYDelayed * tYDelayed
          : 1 - Math.pow(-2 * tYDelayed + 2, 2) / 2;
        groupRef.current.position.y = THREE.MathUtils.lerp(0, targetY, tYEased);

        // Snap rotation to forward immediately when sitting
        groupRef.current.rotation.y = 0;
      } else {
        if (sentadoActivo) {
          // Snap Y directly when fully seated — no lerp oscillation
          groupRef.current.position.y = targetY;
        } else {
          const verticalFollow = 1 - Math.pow(1 - 0.35, delta * 60);
          groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, verticalFollow);
        }

        // Snap rotation to forward while seated; lerp back to 0 when standing up
        if (sentadoActivo) {
          groupRef.current.rotation.y = 0;
        } else {
          const rotationFollow = 1 - Math.pow(1 - 0.25, delta * 60);
          groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, rotationFollow);
        }
      }
    }

    (camera as any).userData.playerPosition = { x: positionRef.current.x, z: positionRef.current.z };
    // Exponer dirección al CameraFollow para chase-cam rotation
    (camera as any).userData.playerDirection = newDirection;
    (camera as any).userData.playerMoving = movedThisFrame;
    if (onPositionUpdate) onPositionUpdate(positionRef.current.x, positionRef.current.z);

    const syncNow = state.clock.getElapsedTime();
    if (syncNow - lastSyncTime.current > 0.15) {
      // Round to 1 decimal to allow shallow-equality bailout in store when idle
      const syncX = Math.round(positionRef.current.x * 160) / 10;
      const syncY = Math.round(positionRef.current.z * 160) / 10;
      setPosition(syncX, syncY, newDirection, effectiveAnimState === 'sit', moving);
      lastSyncTime.current = syncNow;
    }

    if (broadcastMovement) {
      const currentAnim = animationStateRef.current;
      const payload = {
        x: Number((positionRef.current.x * 16).toFixed(1)),
        y: Number((positionRef.current.z * 16).toFixed(1)),
        direction: newDirection,
        isMoving: moving,
        animState: currentAnim,
      };
      const last = lastBroadcastRef.current;
      const bNow = Date.now();
      const changed = !last || Math.abs(last.x - payload.x) > 0.5 || Math.abs(last.y - payload.y) > 0.5 || last.direction !== payload.direction || last.isMoving !== payload.isMoving || last.animState !== payload.animState;
      const animChanged = !last || last.animState !== currentAnim;
      const isReliable = animChanged;
      const isSpecialAnim = !['idle', 'walk', 'run'].includes(currentAnim);
      const shouldHeartbeatSpecial = isSpecialAnim && (bNow - lastBroadcastTime.current > 200);
      // Idle heartbeat: re-broadcast current position every 2s even when still.
      // Without this, a stationary user's peers see them at their last-tracked
      // Presence coords (which may be (0,0) if location-privacy is off, or a
      // stale value). Once a DataPacket arrives, remotes update. Presence is a
      // CRDT with no ordering guarantees — not suitable for position seed.
      // Ref: https://docs.livekit.io/home/client/data/packets/ (lossy OK for this)
      const shouldHeartbeatIdle = (bNow - lastBroadcastTime.current > 2000);

      if (changed || shouldHeartbeatSpecial || shouldHeartbeatIdle) {
        broadcastMovement(payload.x, payload.y, payload.direction, payload.isMoving, payload.animState, isReliable);
        lastBroadcastRef.current = payload;
        lastBroadcastTime.current = bNow;
      }
    }
  }, -2);

  return (
    <>
      <group ref={groupRef} position={[positionRef.current.x, 0, positionRef.current.z]}>
        {/* Ocultar avatar durante fase 'out' del teleport */}
        {teleportPhase !== 'out' && (
          <Avatar
            position={new THREE.Vector3(0, 0, 0)}
            config={currentUser.avatarConfig}
            name={currentUser.name}
            status={currentUser.status}
            isCurrentUser={true}
            animationState={effectiveAnimState}
            direction={(seatRuntime || seatRuntimeRef.current) && (effectiveAnimState === 'sit' || effectiveAnimState === 'sit_down' || effectiveAnimState === 'stand_up') ? 'front' : direction}
            isSitting={isSitting}
            seatForwardRotation={(seatRuntime || seatRuntimeRef.current)?.rotacion ?? 0}
            reaction={reactions.length > 0 ? reactions[reactions.length - 1].emoji : null}
            videoStream={stream}
            localVideoTrack={localVideoTrack}
            effectType={backgroundEffect}
            videoIsProcessed={videoIsProcessed}
            camOn={currentUser.isCameraOn}
            showVideoBubble={showVideoBubble}
            message={message}
            onClickAvatar={onClickAvatar}
            onAvatarHeightComputed={handleAvatarHeightComputed}
            onMetricasAvatarComputadas={handleMetricasAvatarComputadas}
          />
        )}
        {/* Múltiples emojis flotantes estilo Gather */}
        {reactions.map((r, idx) => (
          <Html key={r.id} position={[0.3 * (idx % 3 - 1), 3.2 + (idx * 0.3), 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
            <div className="animate-emoji-float text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
              {r.emoji}
            </div>
          </Html>
        ))}
      </group>

      {/* Efectos de teletransportación */}
      {teleportPhase === 'out' && teleportOrigin && (
        <TeleportEffect position={teleportOrigin} phase="out" />
      )}
      {teleportPhase === 'in' && teleportDest && (
        <TeleportEffect position={teleportDest} phase="in" />
      )}
    </>
  );
};

