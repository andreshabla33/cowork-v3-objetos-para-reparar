'use client';
import React, { useRef, useEffect, useMemo, Suspense, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Grid, Text, CameraControls, Html, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import { useAvatarControls } from '../avatar3d/useAvatarControls';
import type { AnimationState } from '../avatar3d/shared';
import { VideoWithBackground } from '../VideoWithBackground';
import { GhostAvatar } from '../3d/GhostAvatar';
import { ZonaEmpresa as ZonaEmpresa3D } from '../3d/ZonaEmpresa';
import { Escritorio3D } from '../3d/Escritorio3D';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ObjetosInteractivos } from '../3d/ObjetosInteractivos';
import { ParticulasClima } from '../3d/ParticulasClima';
import { EmoteSync, useSyncEffects } from '../3d/EmoteSync';
import { hapticFeedback, isMobileDevice } from '@/lib/mobileDetect';
import { useStore } from '@/store/useStore';
import { type CameraSettings } from '../CameraSettingsMenu';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { type JoystickInput } from '../3d/MobileJoystick';
import { getSettingsSection } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar, themeColors,
  MOVE_SPEED, RUN_SPEED, WORLD_SIZE, TELEPORT_DISTANCE,
  CHAIR_SIT_RADIUS, CHAIR_POSITIONS_3D, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE,
  USAR_LIVEKIT, playTeleportSound, IconPrivacy, IconExpand, obtenerDireccionDesdeVector,
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

// --- Player ---
export interface PlayerProps {
  currentUser: User;
  setPosition: (x: number, y: number, direction: string, isSitting: boolean, isMoving: boolean) => void;
  stream: MediaStream | null;
  showVideoBubble?: boolean;
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
  empresasAutorizadas?: string[];
  usersInCallIds?: Set<string>;
  mobileInputRef?: React.MutableRefObject<JoystickInput>;
  onXPEvent?: (accion: string, cooldownMs?: number) => void;
  espacioObjetos?: EspacioObjeto[];
  asientos?: AsientoRuntime3D[];
  ocupacionesAsientosPorObjetoId?: Map<string, OcupacionAsientoReal>;
  onOcuparAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onLiberarAsiento?: (asiento: AsientoRuntime3D | null) => Promise<boolean>;
  onRefrescarAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  obstaculos?: ObstaculoColision3D[];
}

export const Player: React.FC<PlayerProps> = ({ currentUser, setPosition, stream, showVideoBubble = true, message, reactions = [], onClickAvatar, moveTarget, onReachTarget, teleportTarget, onTeleportDone, broadcastMovement, moveSpeed, runSpeed, ecsStateRef, onPositionUpdate, zonasEmpresa = [], empresasAutorizadas = [], usersInCallIds, mobileInputRef, onXPEvent, espacioObjetos = [], asientos = [], ocupacionesAsientosPorObjetoId = new Map(), onOcuparAsiento, onLiberarAsiento, onRefrescarAsiento, obstaculos = [] }) => {
  const groupRef = useRef<THREE.Group>(null);
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

  const initialPosition = useMemo(() => {
    // 1. Persistencia ECS (prioridad si es reciente - < 2s)
    const ecsData = ecsStateRef?.current ? obtenerEstadoUsuarioEcs(ecsStateRef.current, currentUser.id) : null;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 2000) {
      return { x: ecsData.x, z: ecsData.z };
    }

    // 2. Spawn Point de Empresa (Gemelo Digital)
    if (currentUser.empresa_id && zonasEmpresa.length > 0) {
      // Buscar zona activa de mi empresa
      const miZona = zonasEmpresa.find(z => z.empresa_id === currentUser.empresa_id && z.estado === 'activa');
      // Si tiene spawn definido (y no es 0,0 que es el default si no se ha configurado)
      if (miZona && (Number(miZona.spawn_x) !== 0 || Number(miZona.spawn_y) !== 0)) {
        return {
          x: Number(miZona.spawn_x) / 16,
          z: Number(miZona.spawn_y) / 16
        };
      }
    }

    return { x: (currentUser.x || 400) / 16, z: (currentUser.y || 400) / 16 };
  }, [currentUser.id, currentUser.x, currentUser.y, currentUser.empresa_id, ecsStateRef, zonasEmpresa]);
  const initialDirection = useMemo(() => {
    const ecsData = ecsStateRef?.current ? obtenerEstadoUsuarioEcs(ecsStateRef.current, currentUser.id) : null;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 2000) {
      return ecsData.direction ?? 'front';
    }
    return currentUser.direction ?? 'front';
  }, [currentUser.direction, currentUser.id, ecsStateRef]);
  const positionRef = useRef({ ...initialPosition });
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const animationStateRef = useRef<AnimationState>('idle');
  const baseAnimationStateRef = useRef<AnimationState>('idle');
  
  const [direction, setDirection] = useState<string>(initialDirection);
  const directionRef = useRef<string>(initialDirection);
  const [isRunning, setIsRunning] = useState(false);
  
  const [isSitting, setIsSitting] = useState(false);

  // === SISTEMA DE ANIMACIONES CONTEXTUALES ===
  const [contextualAnim, setContextualAnim] = useState<AnimationState | null>(null);
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
  const [seatRuntime, setSeatRuntime] = useState<AsientoRuntime3D | null>(null);
  const avatarHeightRef = useRef<number>(ALTURA_AVATAR_ESTANDAR);
  const avatarHipHeightRef = useRef<number>(ALTURA_AVATAR_ESTANDAR * 0.53);
  const avatarSitHipHeightRef = useRef<number | null>(null);

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
    console.log('[SIT_DEBUG][player]', fase, payload);
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
      console.log('[SIT_DEBUG][player] pelvis_sentada_recibida', {
        alturaCaderaSentada: Number(metricas.alturaCaderaSentada.toFixed(4)),
      });
    }
  }, []);

  const obtenerOffsetVerticalSentado = useCallback((asiento: AsientoRuntime3D | null) => {
    if (!asiento) return 0;
    if (avatarSitHipHeightRef.current != null) {
      return asiento.posicion.y - avatarSitHipHeightRef.current;
    }
    const alturaAvatar = THREE.MathUtils.clamp(avatarHeightRef.current || ALTURA_AVATAR_ESTANDAR, 1.2, 2.4);
    const pelvisEstimada = alturaAvatar * 0.30;
    return asiento.posicion.y - pelvisEstimada;
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
  const sitCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (sitCheckRef.current) clearInterval(sitCheckRef.current);
    sitCheckRef.current = setInterval(() => {
      void (async () => {
        if (animationStateRef.current !== 'idle' || contextualAnim) return;
        const px = positionRef.current?.x;
        const pz = positionRef.current?.z;
        if (px == null || pz == null) return;

        const asientoDetectado = resolverAsientoUsuario({ x: px, z: pz }, null, asientosRef.current);
        if (!asientoDetectado) return;
        if (asientoOcupadoPorOtroUsuario(asientoDetectado)) return;
        if (
          seatCaptureCooldownSeatIdRef.current === asientoDetectado.id &&
          performance.now() < seatCaptureCooldownUntilRef.current
        ) {
          logSitDebug('captura_bloqueada_cooldown', {
            asientoId: asientoDetectado.id,
            restanteMs: Math.round(seatCaptureCooldownUntilRef.current - performance.now()),
          });
          return;
        }

        const distanciaAlAsiento = Math.hypot(
          asientoDetectado.posicion.x - positionRef.current.x,
          asientoDetectado.posicion.z - positionRef.current.z
        );

        if (distanciaAlAsiento > asientoDetectado.radioCaptura) {
          logSitDebug('captura_omitida', {
            asientoId: asientoDetectado.id,
            distancia: Number(distanciaAlAsiento.toFixed(3)),
            radioCaptura: Number(asientoDetectado.radioCaptura.toFixed(3)),
            radioActivacion: Number(asientoDetectado.radioActivacion.toFixed(3)),
            rotacion: Number(asientoDetectado.rotacion.toFixed(3)),
          });
          return;
        }

        const reservado = await reservarAsientoPersistente(asientoDetectado);
        if (!reservado) return;

        seatApproachDurationMsRef.current = THREE.MathUtils.clamp(
          Math.round(Math.max(ANIMATION_SIT_DOWN_DURATION, distanciaAlAsiento * 650)),
          ANIMATION_SIT_DOWN_DURATION,
          1600
        );

        logSitDebug('captura_iniciada', {
          asientoId: asientoDetectado.id,
          distancia: Number(distanciaAlAsiento.toFixed(3)),
          radioCaptura: Number(asientoDetectado.radioCaptura.toFixed(3)),
          posicionAsiento: {
            x: Number(asientoDetectado.posicion.x.toFixed(3)),
            y: Number(asientoDetectado.posicion.y.toFixed(3)),
            z: Number(asientoDetectado.posicion.z.toFixed(3)),
          },
          rotacion: Number(asientoDetectado.rotacion.toFixed(3)),
          duracionMs: seatApproachDurationMsRef.current,
          offsetVerticalEstimado: Number(obtenerOffsetVerticalSentado(asientoDetectado).toFixed(3)),
          avatarAltura: Number(avatarHeightRef.current.toFixed(3)),
          avatarCadera: Number(avatarHipHeightRef.current.toFixed(3)),
          perfilAsiento: asientoDetectado.perfil.tipoPerfil,
          aproximacionFrontal: Number(asientoDetectado.perfil.aproximacionFrontal.toFixed(3)),
        });

        setSeatRuntime((prev) => prev?.id === asientoDetectado.id ? prev : asientoDetectado);
        setContextualAnim('sit_down');
        if (seatTransitionTimerRef.current) clearTimeout(seatTransitionTimerRef.current);
        seatTransitionTimerRef.current = setTimeout(() => {
          positionRef.current.x = asientoDetectado.posicion.x;
          positionRef.current.z = asientoDetectado.posicion.z;
          setContextualAnim('sit');
        }, seatApproachDurationMsRef.current);
      })();
    }, 1000);
    return () => {
      if (sitCheckRef.current) clearInterval(sitCheckRef.current);
      if (seatTransitionTimerRef.current) clearTimeout(seatTransitionTimerRef.current);
    };
  }, [asientoOcupadoPorOtroUsuario, contextualAnim, reservarAsientoPersistente]);

  useEffect(() => {
    return () => {
      if (seatRuntimeRef.current) {
        void onLiberarAsiento?.(seatRuntimeRef.current);
      }
    };
  }, [onLiberarAsiento]);

  // Fase 3: Reacciones desde chat — detectar emojis en mensajes y disparar animación
  const prevMessageRef = useRef<string | undefined>();
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
  const lastBroadcastRef = useRef<{ x: number; y: number; direction: string; isMoving: boolean; animState?: string } | null>(null);
  const { camera } = useThree();

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
    playTeleportSound();

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
  }, [teleportTarget]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
      if (isTyping) return;

      keysPressed.current.add(e.code);

      // Shift para correr
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
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

      // Soltar shift
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
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

    // Velocidad según si corre o camina
    const baseMoveSpeed = moveSpeed ?? MOVE_SPEED;
    const baseRunSpeed = runSpeed ?? RUN_SPEED;
    const speed = isRunning ? baseRunSpeed : baseMoveSpeed;

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
    const seatImmobilized = !!currentSeatRuntime && (effectiveAnimState === 'sit' || effectiveAnimState === 'sit_down');
    const seatLocked = !!currentSeatRuntime && (effectiveAnimState === 'sit' || effectiveAnimState === 'sit_down');

    if (seatLocked && (hasKeyboardInput || hasJoystickInput || moveTarget)) {
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
      }, 350);
    }

    if (seatImmobilized && currentSeatRuntime) {
      if (effectiveAnimState === 'sit_down' && seatApproachOriginRef.current && seatApproachStartedAtRef.current !== null) {
        positionRef.current.x = currentSeatRuntime.posicion.x;
        positionRef.current.z = currentSeatRuntime.posicion.z;
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
    const shouldRun = hasKeyboardInput ? isRunning : (hasJoystickInput && joystick?.isRunning);

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
    }

    const moving = !seatImmobilized && (movedThisFrame || huboMovimientoReal);
    if (!moving && (baseAnimationStateRef.current === 'walk' || baseAnimationStateRef.current === 'run')) {
      actualizarAnimationStateBase('idle');
    }

    if (newDirection !== direccionActual) actualizarDirectionVisual(newDirection);

    if (groupRef.current) {
      groupRef.current.position.x = positionRef.current.x;
      groupRef.current.position.z = positionRef.current.z;
      const sentadoActivo = !!currentSeatRuntime && (effectiveAnimState === 'sit' || effectiveAnimState === 'sit_down');
      const targetY = sentadoActivo && currentSeatRuntime
        ? obtenerOffsetVerticalSentado(currentSeatRuntime)
        : 0;
      const verticalFollow = 1 - Math.pow(1 - 0.3, delta * 60);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, verticalFollow);

      const targetRot = sentadoActivo ? currentSeatRuntime.rotacion : 0;
      const rotationFollow = 1 - Math.pow(1 - 0.2, delta * 60);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRot, rotationFollow);
    }

    (camera as any).userData.playerPosition = { x: positionRef.current.x, z: positionRef.current.z };
    if (onPositionUpdate) onPositionUpdate(positionRef.current.x, positionRef.current.z);

    const syncNow = state.clock.getElapsedTime();
    if (syncNow - lastSyncTime.current > 0.1) {
      setPosition(positionRef.current.x * 16, positionRef.current.z * 16, newDirection, effectiveAnimState === 'sit', moving);
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
      const shouldHeartbeat = isSpecialAnim && (bNow - lastBroadcastTime.current > 200);

      if (changed || shouldHeartbeat) {
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
            direction={seatRuntime && (effectiveAnimState === 'sit' || effectiveAnimState === 'sit_down') ? 'front' : direction}
            isSitting={isSitting}
            reaction={reactions.length > 0 ? reactions[reactions.length - 1].emoji : null}
            videoStream={stream}
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

