'use client';
import React, { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import type { AnimationState, AvatarAssetQuality, Avatar3DConfig } from '../avatar3d/shared';
import { resolveAvatarModelUrl } from '../avatar3d/shared';
import { GhostAvatar } from '../3d/GhostAvatar';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { useStore } from '@/store/useStore';
import { obtenerDimensionesObjetoRuntime } from './objetosRuntime';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { getSettingsSection, subscribeToSettings } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar,
  TELEPORT_DISTANCE, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE, CULL_DISTANCE,
  obtenerDireccionDesdeVector
} from './shared';
import type { LocalVideoTrack } from 'livekit-client';
import { statusColors, type VirtualSpace3DProps } from './spaceTypes';
import { StableVideo } from './Overlays';
import { VideoWithBackground } from '@/components/VideoWithBackground';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';

// ECS imports (PR-6/7/9/10)
import { avatarStore } from '@/lib/ecs/AvatarECS';
import { movementSystem, cullingSystem, animationSystem } from '@/lib/ecs/AvatarSystems';

// Shared singleton geometries — prevent geometry leak on re-render (DEBT-004)
import {
  hitTestCylinderCurrentUser,
  hitTestCylinderRemote,
  crowdMarkerGeometry,
  teleportCylinderGeometry,
  teleportRingGeometry,
} from '../3d/sharedGeometries';
import { resolveAvatarRenderPolicy, resolveEffectiveGraphicsQuality } from '@/lib/ecs/avatarRenderPolicy';
import { getGpuInfoSync } from '@/lib/gpuCapabilities';
import { AvatarRuntimeScheduler, resolveAvatarRuntimePolicy } from '@/lib/ecs/avatarRuntimeScheduler';
import { SpatialGrid } from '@/lib/spatial/SpatialGrid';
import { frameMetrics } from '@/lib/metrics/frameMetrics';
import { AvatarLabels } from '../3d/AvatarLabels';
import { CrowdInstances, type CrowdEntity } from './CrowdInstances';
import { MidLodInstances, type MidLodEntity } from './MidLodInstances';
import { InstancedAvatarRenderer } from '../3d/InstancedAvatarRenderer';
import { DEFAULT_MODEL_URL } from '../avatar3d/shared';
import {
  IDLE_HERO_FRAMING,
  selectGameplayFraming,
  dampLambdaForDurationMs,
  IDLE_THRESHOLD_MS,
  TRANSITION_TO_IDLE_MS,
  TRANSITION_TO_MOVING_MS,
  DRAWING_OVERVIEW_FRAMING,
  TRANSITION_TO_DRAWING_MS,
} from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';

/**
 * Fallback Avatar3DConfig for remote users whose avatar3DConfig is null/undefined.
 * Ensures GLTFAvatar always receives a valid config object — prevents shader errors
 * when the presence payload omits avatar data (e.g. cross-company users before fix,
 * or network-level payload truncation).
 */
const FALLBACK_AVATAR_3D_CONFIG: Avatar3DConfig = {
  id: 'default',
  nombre: 'Default',
  modelo_url: DEFAULT_MODEL_URL,
  escala: 1,
};

// STATUS_LABELS moved to spaceTypes.ts (shared with AvatarLabels via Clean Architecture)

// ─── Helpers ────────────────────────────────────────────────────────────────

const obtenerZonaActivaEmpresa = (zonasEmpresa: ZonaEmpresa[] = [], empresaId?: string | null) => {
  if (!empresaId) return null;
  return zonasEmpresa.find((zona) => zona.empresa_id === empresaId && zona.estado === 'activa') || null;
};

const limitarPosicionAZonaEmpresa = (
  x: number, z: number, empresaId?: string | null, zonasEmpresa: ZonaEmpresa[] = []
) => {
  const zonaPropia = obtenerZonaActivaEmpresa(zonasEmpresa, empresaId);
  if (!zonaPropia) return { x, z };
  const centroX = Number(zonaPropia.posicion_x) / 16;
  const centroZ = Number(zonaPropia.posicion_y) / 16;
  const halfW = Math.max((Number(zonaPropia.ancho) / 16) / 2, 0.35);
  const halfH = Math.max((Number(zonaPropia.alto) / 16) / 2, 0.35);
  const padding = 0.35;
  return {
    x: THREE.MathUtils.clamp(x, centroX - Math.max(halfW - padding, 0.1), centroX + Math.max(halfW - padding, 0.1)),
    z: THREE.MathUtils.clamp(z, centroZ - Math.max(halfH - padding, 0.1), centroZ + Math.max(halfH - padding, 0.1)),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AVATAR (Componente individual) ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export interface AvatarProps {
  position: THREE.Vector3;
  config: any;
  name: string;
  status: PresenceStatus;
  isCurrentUser?: boolean;
  animationState?: AnimationState;
  direction?: string;
  isSitting?: boolean;
  sitPosition?: THREE.Vector3;
  sitRotation?: number;
  sitTransitionDurationMs?: number;
  seatForwardRotation?: number;
  reaction?: string | null;
  videoStream?: MediaStream | null;
  /**
   * `LocalVideoTrack` wrapper del usuario actual con el processor aplicado
   * (blur / virtual background). Solo se pasa para `isCurrentUser=true`.
   * Cuando está disponible, la burbuja local renderiza via `track.attach()`
   * del SDK de LiveKit → muestra el `processedTrack`. Los avatares remotos
   * NO usan esto: siguen con `videoStream` crudo porque el processor ya
   * fue aplicado en el lado del emisor antes de publicar.
   */
  localVideoTrack?: LocalVideoTrack | null;
  /** Tipo de efecto activo (para clases CSS / debug; el procesamiento lo
   * hace el SDK en el track). Solo aplica a `isCurrentUser`. */
  effectType?: EffectType;
  videoIsProcessed?: boolean;
  camOn?: boolean;
  showVideoBubble?: boolean;
  message?: string | null;
  onClickAvatar?: () => void;
  onClickRemoteAvatar?: (userId: string) => void;
  userId?: string;
  mirrorVideo?: boolean;
  hideSelfView?: boolean;
  showName?: boolean;
  lodLevel?: AvatarLodLevel;
  esFantasma?: boolean;
  remoteAvatar3DConfig?: any;
  onAvatarHeightComputed?: (height: number) => void;
  onMetricasAvatarComputadas?: (metricas: { altura: number; alturaCadera: number; alturaCaderaSentada?: number }) => void;
  /**
   * When true, the 3D mesh is rendered by InstancedAvatarRenderer (GPU instancing).
   * This Avatar component only renders overlays (video, chat, name, reaction, radial).
   * The invisible hit-test cylinder is still rendered for interaction.
   */
  useInstancedMesh?: boolean;
  castShadow?: boolean;
  avatarInteractions?: {
    onGoTo?: (userId: string) => void;
    onNudge?: (userId: string) => void;
    onInvite?: (userId: string) => void;
    onFollow?: (userId: string) => void;
    onWave?: (userId: string) => void;
    followTargetId?: string | null;
    profilePhoto?: string | null;
  };
}

export const Avatar: React.FC<AvatarProps> = ({
  position, config, name, status, isCurrentUser,
  animationState = 'idle', direction,
  isSitting = false, seatForwardRotation = 0,
  reaction, videoStream, localVideoTrack, effectType = 'none', videoIsProcessed = false,
  camOn, showVideoBubble = true, message,
  onClickAvatar, onClickRemoteAvatar, userId,
  mirrorVideo: mirrorVideoProp, hideSelfView: hideSelfViewProp,
  showName: _showNameProp, lodLevel: lodLevelProp,
  esFantasma = false, remoteAvatar3DConfig,
  onAvatarHeightComputed, onMetricasAvatarComputadas,
  avatarInteractions, useInstancedMesh = false, castShadow = true
}) => {
  const [showRadialWheel, setShowRadialWheel] = useState(false);
  const [avatarHeight, setAvatarHeight] = useState(2.0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef(0);
  const clickPreventedRef = useRef(false);
  const { avatar3DConfig } = useStore();
  // Cuando el admin está en modo edición, el avatar propio NO debe capturar
  // clicks: si lo hace, bloquea la selección/movimiento de objetos detrás de
  // él (caso reportado: monitor cerca del avatar abre el modal del avatar
  // en lugar de seleccionar el objeto).
  const isEditMode = useStore((s) => s.isEditMode);

  const videoSettings = useMemo(() => getSettingsSection('video'), []);
  const perfS = useMemo(() => getSettingsSection('performance'), []);
  const mirrorVideo = mirrorVideoProp ?? videoSettings.mirrorVideo ?? true;
  const hideSelfView = hideSelfViewProp ?? videoSettings.hideSelfView ?? false;
  // showName is now handled by unified AvatarLabels (Clean Architecture)
  const lodLevel = lodLevelProp ?? 'high';
  const showHigh = lodLevel === 'high';
  const showMid = lodLevel === 'mid';
  const showLow = lodLevel === 'low';
  const esMismaEmpresa = !esFantasma && !isCurrentUser;
  // When useInstancedMesh=true, the 3D mesh is handled by InstancedAvatarRenderer.
  // Skip GLTFAvatar to avoid double-rendering the same avatar.
  // Also skip the sprite fallback — rendering a statusColor sprite while
  // InstancedAvatarRenderer loads produces the "green triangle" artifact.
  const renderGLTF = !useInstancedMesh && (showHigh || (esMismaEmpresa && showMid));
  const renderSprite = !renderGLTF && !useInstancedMesh && (showMid || showLow);
  const assetQuality: AvatarAssetQuality = showLow ? 'low' : showMid ? 'medium' : 'high';
  const effectiveAnimState = perfS.showAvatarAnimations === false ? 'idle' as AnimationState : animationState;

  const videoY = avatarHeight + 1.15;
  const chatY = avatarHeight + (camOn ? 2.75 : 0.95);
  const reactionY = avatarHeight + (camOn ? 1.75 : 0.65);
  const radialY = avatarHeight + (camOn ? 2.05 : 0.65);
  const allowVideo = (showHigh || showMid) && camOn;
  const allowMessage = showHigh && message;
  const allowReaction = (showHigh || showMid) && reaction;
  const spriteColor = isCurrentUser ? '#60a5fa' : statusColors[status];

  useEffect(() => {
    if (onAvatarHeightComputed && avatarHeight > 0) onAvatarHeightComputed(avatarHeight);
  }, [avatarHeight, onAvatarHeightComputed]);

  const handlePointerDown = useCallback((e: any) => {
    if (isCurrentUser || !userId || !avatarInteractions) return;
    e.stopPropagation();
    clickPreventedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      clickPreventedRef.current = true;
      setShowRadialWheel(true);
    }, 500);
  }, [isCurrentUser, userId, avatarInteractions]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);

  const handleClick = useCallback((e: any) => {
    // Modo edición: avatar propio NO captura el click (deja pasar al objeto).
    if (isCurrentUser && isEditMode) return;
    e.stopPropagation();
    if (isCurrentUser && onClickAvatar) { onClickAvatar(); return; }
    if (isCurrentUser || !userId) return;
    if (clickPreventedRef.current) { clickPreventedRef.current = false; return; }
    const now = Date.now();
    if (now - lastClickRef.current < 350 && avatarInteractions?.onGoTo) {
      setShowRadialWheel(false);
      avatarInteractions.onGoTo(userId);
      lastClickRef.current = now;
      return;
    }
    lastClickRef.current = now;
    setShowRadialWheel(false);
    if (onClickRemoteAvatar) onClickRemoteAvatar(userId);
  }, [isCurrentUser, userId, onClickAvatar, onClickRemoteAvatar, avatarInteractions]);

  return (
    <group position={position} onClick={handleClick} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      <mesh visible={false} geometry={isCurrentUser ? hitTestCylinderCurrentUser : hitTestCylinderRemote}>
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {renderGLTF && (
        // Key estable por entidad (userId) + modelUrl efectivo.
        // Fix 2026-04-22: antes el key incluía `assetQuality`, lo que hacía
        // REMOUNT de GLTFAvatar cada vez que el LOD cambiaba (near/mid/low)
        // aunque el modelUrl resuelto fuera el mismo (usuarios sin URLs
        // separados por calidad). Consecuencias: 3 cargas de animaciones,
        // texture leak monotónico (+12 por remount), WebGL context lost,
        // T-pose flash repetido.
        //
        // El key ahora depende del modelUrl resuelto — solo remonta si
        // realmente cambia el GLB (p.ej. usuario cambia de avatar o tiene
        // URLs específicas por calidad). Para cambios de calidad sin cambio
        // de URL, React reconcilia y GLTFAvatar reacciona a `assetQuality`
        // via props (texturas por calidad via useEffect).
        //
        // React docs: https://react.dev/learn/rendering-lists#rules-of-keys
        // Three.js docs: https://threejs.org/docs/#api/en/objects/LOD
        // — mount-once + visible toggle, nunca remount en LOD transitions.
        <GLTFAvatar
          key={`${userId ?? (isCurrentUser ? 'self' : 'remote')}:${resolveAvatarModelUrl(
            isCurrentUser ? avatar3DConfig : (remoteAvatar3DConfig || FALLBACK_AVATAR_3D_CONFIG),
            assetQuality
          )}`}
          avatarConfig={isCurrentUser ? avatar3DConfig : (remoteAvatar3DConfig || FALLBACK_AVATAR_3D_CONFIG)}
          animationState={effectiveAnimState}
          direction={direction}
          isSitting={isSitting}
          sitRotation={seatForwardRotation}
          skinColor={config?.skinColor}
          clothingColor={config?.clothingColor}
          scale={1}
          assetQuality={assetQuality}
          onHeightComputed={setAvatarHeight}
          onMetricasAvatarComputadas={onMetricasAvatarComputadas}
        />
      )}

      {renderSprite && (
        <sprite scale={showMid ? [1.6, 1.6, 1.6] : [0.8, 0.8, 0.8]}>
          <spriteMaterial color={spriteColor} />
        </sprite>
      )}

      {allowMessage && (
        <Html position={[0, chatY, 0]} center distanceFactor={10} zIndexRange={[100, 0]}>
          <div className="animate-chat-bubble">
            <div className="bg-white/95 backdrop-blur-sm text-gray-800 px-3 py-1.5 rounded-full shadow-lg max-w-[180px] text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              {message}
            </div>
          </div>
        </Html>
      )}

      {allowVideo && showVideoBubble && !(isCurrentUser && hideSelfView) && (
        <Html position={[0, videoY, 0]} center distanceFactor={12} zIndexRange={[100, 0]}>
          <div className="w-24 h-16 rounded-[12px] overflow-hidden border-[2px] border-[#6366f1] shadow-lg bg-black relative">
            {isCurrentUser && (localVideoTrack || (videoStream && videoStream.getVideoTracks().length > 0)) ? (
              // Path nativo para el usuario actual: VideoWithBackground usa
              // track.attach() → muestra el processedTrack del background
              // processor (blur / virtual bg). Fallback a stream crudo si
              // el wrapper aún no existe.
              // MIRROR: depende sólo de mirrorVideo (el processor no invierte).
              <VideoWithBackground
                stream={videoStream ?? null}
                localVideoTrack={localVideoTrack ?? null}
                effectType={effectType}
                mirrorVideo={!!mirrorVideo}
                muted
                className="w-full h-full object-cover"
              />
            ) : videoStream && videoStream.getVideoTracks().length > 0 ? (
              // Avatares remotos: stream crudo. El emisor ya aplicó el
              // processor antes de publicar, así que este stream ya llega
              // con blur cuando corresponde.
              <StableVideo stream={videoStream} muted={false} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-indigo-900/80 to-purple-900/80">
                <span className="text-[9px] text-white/80 font-medium">{name.split(' ')[0]}</span>
              </div>
            )}
          </div>
        </Html>
      )}
      {/* videoIsProcessed queda como hint semántico para futuras optimizaciones
          (p.ej. desactivar post-process CSS redundantes), pero no se usa aquí. */}
      {false && videoIsProcessed /* reserved */}

      {allowReaction && (
        <Html position={[0, reactionY, 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
          <div className="animate-emoji-float text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">{reaction}</div>
        </Html>
      )}

      {/* Name labels are now rendered by the unified AvatarLabels component (Clean Architecture).
        * All label logic (dynamic Y, current user color, status tooltip, distance culling)
        * is handled via PrepararAvatarLabelsUseCase → AvatarLabels. */}

      {showRadialWheel && !isCurrentUser && userId && avatarInteractions && (
        <Html position={[0, radialY, 0]} center distanceFactor={6} zIndexRange={[310, 0]}>
          <div className="select-none pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowRadialWheel(false); }}>
            <div className="relative w-[160px] h-[160px]">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-zinc-800/90 border border-white/10 flex items-center justify-center z-10">
                <span className="text-[9px] font-bold text-white/60">{name.split(' ')[0]}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onFollow?.(userId); setShowRadialWheel(false); }} className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-violet-600/80 hover:bg-violet-500 text-white" title="Seguir">
                <span className="text-[7px] font-bold">{avatarInteractions.followTargetId === userId ? 'Dejar' : 'Seguir'}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onInvite?.(userId); setShowRadialWheel(false); }} className="absolute top-1/2 right-0 -translate-y-1/2 w-12 h-12 rounded-full bg-indigo-600/80 text-white" title="Invitar">
                <span className="text-[7px] font-bold">Invitar</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onWave?.(userId); setShowRadialWheel(false); }} className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-amber-500/80 text-white" title="Saludar">
                <span className="text-lg">👋</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onNudge?.(userId); setShowRadialWheel(false); }} className="absolute top-1/2 left-0 -translate-y-1/2 w-12 h-12 rounded-full bg-pink-500/80 text-white" title="Ring">
                <span className="text-[7px] font-bold">Ring</span>
              </button>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── REMOTE USERS (ECS-Driven, PR-6/7/9/10) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const avatarSpatialGrid = new SpatialGrid<{ id: string }>(20);

const CrowdAvatarMarker: React.FC<{
  status: PresenceStatus;
  onClick?: () => void;
}> = ({ status, onClick }) => (
  <mesh onClick={(e) => { e.stopPropagation(); onClick?.(); }} geometry={crowdMarkerGeometry}>
    <meshBasicMaterial color={statusColors[status]} toneMapped={false} />
  </mesh>
);

export interface RemoteUsersProps {
  users: User[];
  remoteStreams: Map<string, MediaStream>;
  showVideoBubble?: boolean;
  usersInCallIds?: Set<string>;
  usersInAudioRangeIds?: Set<string>;
  remoteMessages: Map<string, string>;
  remoteReaction: { emoji: string; from: string; fromName: string } | null;
  realtimePositionsRef?: React.MutableRefObject<Map<string, any>>;
  interpolacionWorkerRef?: React.MutableRefObject<Worker | null>;
  posicionesInterpoladasRef?: React.MutableRefObject<Map<string, { x: number; z: number; direction?: DireccionAvatar; isMoving?: boolean }>>;
  ecsStateRef?: React.MutableRefObject<EstadoEcsEspacio>;
  zonasEmpresa?: ZonaEmpresa[];
  frustumRef?: React.MutableRefObject<THREE.Frustum>;
  onClickRemoteAvatar?: (userId: string) => void;
  avatarInteractions?: AvatarProps['avatarInteractions'];
}

export const RemoteUsers: React.FC<RemoteUsersProps> = ({
  users, remoteStreams, showVideoBubble, usersInCallIds, usersInAudioRangeIds,
  remoteMessages, remoteReaction, realtimePositionsRef, posicionesInterpoladasRef,
  ecsStateRef, zonasEmpresa = [], frustumRef,
  onClickRemoteAvatar, avatarInteractions,
}) => {
  const { currentUser } = useStore();
  const { camera } = useThree();
  const frustumLocal = useMemo(() => new THREE.Frustum(), []);
  const projMatrix = useMemo(() => new THREE.Matrix4(), []);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [renderVersion, setRenderVersion] = useState(0);
  const lastRenderVersionRef = useRef(0);
  const groupRefs = useRef(new Map<string, THREE.Group>());
  const isDocumentVisibleRef = useRef(typeof document === 'undefined' ? true : !document.hidden);
  const runtimeSchedulerRef = useRef(new AvatarRuntimeScheduler());
  /** Stable map of userId → measured avatar height for unified AvatarLabels */
  const avatarHeightsRef = useRef(new Map<string, number>());
  /** Factory: returns a stable callback per userId to update avatarHeightsRef */
  const heightCallbacksRef = useRef(new Map<string, (h: number) => void>());
  const getHeightCallback = useCallback((userId: string) => {
    let cb = heightCallbacksRef.current.get(userId);
    if (!cb) {
      cb = (h: number) => { avatarHeightsRef.current.set(userId, h); };
      heightCallbacksRef.current.set(userId, cb);
    }
    return cb;
  }, []);
  const performanceSettings = useMemo(() => getSettingsSection('performance'), [settingsVersion]);

  // Clamp graphicsQuality por GPU tier detectado (getGpuInfoSync lee cache
  // poblada al boot por detectGpuCapabilities). En GPU tier ≤ 1 fuerza 'low'
  // aunque el user haya elegido 'high' — sin este clamp, 100 avatares en
  // Intel UHD con quality='high' consumen >30ms/frame por los 500+ useFrame
  // hooks de GLTFAvatar. Scene3D + AvatarSystems usan este valor para
  // todas las decisiones de LOD.
  const effectiveGraphicsQuality = useMemo(
    () => resolveEffectiveGraphicsQuality(
      performanceSettings.graphicsQuality,
      getGpuInfoSync()?.tier,
    ),
    [performanceSettings.graphicsQuality],
  );

  useEffect(() => {
    return subscribeToSettings(() => {
      setSettingsVersion((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync: usuarios online → avatarStore
  useEffect(() => {
    avatarStore.syncWithOnlineUsers(users, currentUser.id);
  }, [users, currentUser.id]);

  // Drop stale DataPacket positions when an avatar is removed from the ECS.
  // Covers the case where LiveKit's ParticipantDisconnected never fires
  // (peer closes tab briefly and re-joins within the 15s server grace window),
  // but Presence CRDT did remove the user, which removes them from onlineUsers,
  // which removes the entity via syncWithOnlineUsers. Without this, the
  // useFrame loop keeps calling movementSystem.setTarget with the last
  // DataPacket coords, snapping the re-joined avatar back to its old spot.
  useEffect(() => {
    if (!realtimePositionsRef) return;
    const unsub = avatarStore.onRemove((userId: string) => {
      realtimePositionsRef.current.delete(userId);
    });
    return unsub;
  }, [realtimePositionsRef]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      avatarStore.clear();
      avatarSpatialGrid.clear();
      runtimeSchedulerRef.current.reset();
    };
  }, []);

  // ECS Update Loop: 1 único useFrame para TODOS los avatares
  useFrame((state, delta) => {
    // Record frame metrics
    frameMetrics.record(delta);
    frameMetrics.setAvatarCount(avatarStore.size);
    frameMetrics.setDrawCalls((state.gl.info as any).render?.calls ?? 0);

    // 1. Alimentar posiciones del broadcast/realtime al ECS
    if (realtimePositionsRef?.current) {
      for (const [userId, data] of realtimePositionsRef.current) {
        if (userId === currentUser.id) continue;
        if (Date.now() - data.timestamp > 1500) continue;
        movementSystem.setTarget(userId, data.x / 16, data.y / 16, data.direction, data.isMoving, data.animState);
      }
    }

    // 1b. Staleness safety: if a walking/running entity hasn't received a
    // DataPacket in >3s, force isMoving=false. Covers the case where the
    // peer's "stop" packet got dropped (lossy mode) and they're stuck
    // walking forever on our side. The 2s idle heartbeat should normally
    // re-assert state, but on flaky networks more than one heartbeat can
    // drop in a row. 3s is a safe threshold above the heartbeat interval.
    const nowMs = Date.now();
    for (const entity of avatarStore.getAll()) {
      if (!entity.isMoving) continue;
      if (nowMs - entity.lastServerUpdate > 3000) {
        entity.isMoving = false;
      }
    }

    // 2. Alimentar desde ECS state (fallback)
    if (ecsStateRef?.current) {
      for (const entity of avatarStore.getAll()) {
        const ecsData = obtenerEstadoUsuarioEcs(ecsStateRef.current, entity.userId);
        if (!ecsData || Date.now() - (ecsData.timestamp ?? 0) > 2000) continue;
        if (entity.lastServerUpdate > Date.now() - 1500) continue;
        movementSystem.setTarget(entity.userId, ecsData.x, ecsData.z, ecsData.direction, ecsData.isMoving);
      }
    }

    // 3. Alimentar desde worker de interpolación
    if (posicionesInterpoladasRef?.current) {
      for (const [userId, data] of posicionesInterpoladasRef.current) {
        const entity = avatarStore.get(userId);
        if (!entity) continue;
        entity.currentX = data.x;
        entity.currentZ = data.z;
        if (data.direction) entity.direction = data.direction;
        if (data.isMoving !== undefined) entity.isMoving = data.isMoving;
      }
    }

    const runtimePolicy = resolveAvatarRuntimePolicy({
      avatarCount: avatarStore.size,
      graphicsQuality: effectiveGraphicsQuality,
      documentVisible: isDocumentVisibleRef.current,
    });
    const runtimeDecision = runtimeSchedulerRef.current.next(delta, runtimePolicy);

    if (runtimeDecision.runMovement) {
      movementSystem.update(delta);

      // Apply ECS positions directly to THREE.Group refs to bypass React render cycle lag
      for (const entity of avatarStore.getAllVisible()) {
        const g = groupRefs.current.get(entity.userId);
        if (g) {
          g.position.set(entity.currentX, 0, entity.currentZ);
          g.visible = entity.isVisible;
        }
      }
    }

    if (runtimeDecision.runSpatialIndex) {
      // Rebuild grid per scheduler tick to avoid stale occupancy in low-FPS modes.
      avatarSpatialGrid.clear();
      for (const entity of avatarStore.getAll()) {
        avatarSpatialGrid.insert({ id: entity.userId }, entity.currentX, entity.currentZ);
      }
    }

    if (runtimeDecision.runCulling) {
      projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustumLocal.setFromProjectionMatrix(projMatrix);
      cullingSystem.update(camera, frustumLocal, {
        graphicsQuality: effectiveGraphicsQuality,
        avatarCount: avatarStore.size,
        documentVisible: isDocumentVisibleRef.current,
      });
    }

    if (runtimeDecision.runAnimation) {
      animationSystem.update(delta, {
        graphicsQuality: effectiveGraphicsQuality,
        avatarCount: avatarStore.size,
        documentVisible: isDocumentVisibleRef.current,
      });
    }

    if (runtimeDecision.runRenderCommit && avatarStore.version !== lastRenderVersionRef.current) {
      lastRenderVersionRef.current = avatarStore.version;
      setRenderVersion(avatarStore.version);
    }
  });

  const visibleEntities = avatarStore.getAllVisible();
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const renderPolicy = useMemo(() => resolveAvatarRenderPolicy({
    graphicsQuality: effectiveGraphicsQuality,
    avatarCount: visibleEntities.length,
    documentVisible: isDocumentVisibleRef.current,
  }), [effectiveGraphicsQuality, visibleEntities.length]);
  const prioritizedEntities = useMemo(
    () => [...visibleEntities].sort((a, b) => a.distanceToCamera - b.distanceToCamera),
    [visibleEntities, renderVersion]
  );
  const avatarOrigin = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  // Split entities into full-render / mid-LOD capsule / crowd sphere buckets
  const { fullEntities, midEntities, crowdEntities } = useMemo(() => {
    const full: typeof prioritizedEntities = [];
    const mid: MidLodEntity[] = [];
    const crowd: CrowdEntity[] = [];
    const midThreshold = renderPolicy.crowdFallbackDistance * 2;
    for (let i = 0; i < prioritizedEntities.length; i++) {
      const entity = prioritizedEntities[i];
      const user = usersById.get(entity.userId);
      if (!user) continue;
      const beyondBudget = !entity.esFantasma
        && i >= renderPolicy.fullAvatarBudget
        && entity.distanceToCamera > renderPolicy.crowdFallbackDistance;
      if (beyondBudget) {
        if (entity.distanceToCamera <= midThreshold) {
          mid.push({ userId: entity.userId, x: entity.currentX, z: entity.currentZ, status: user.status });
        } else {
          crowd.push({ userId: entity.userId, x: entity.currentX, z: entity.currentZ, status: user.status });
        }
      } else {
        full.push(entity);
      }
    }
    return { fullEntities: full, midEntities: mid, crowdEntities: crowd };
  }, [prioritizedEntities, usersById, renderPolicy]);

  // ── GPU Instanced Avatar Rendering ──────────────────────────────────────────
  // Group non-ghost fullEntities by model URL → 1 InstancedAvatarRenderer per URL.
  // Each renderer handles the 3D mesh via InstancedMesh (1 draw call per model).
  // The Avatar component still renders overlays (video, chat, name, reaction).
  //
  // Models without embedded animations (e.g. external animations loaded from DB)
  // are tracked in unsupportedInstancedModels. When InstancedAvatarRenderer reports
  // a model as unsupported, those users are excluded from instancing and fall back
  // to GLTFAvatar which supports loading external animation files.
  const [unsupportedInstancedModels, setUnsupportedInstancedModels] = useState<Set<string>>(
    () => new Set()
  );

  // ── Models confirmed ready for instancing ─────────────────────────────────
  // A model enters this set ONLY after InstancedAvatarRenderer successfully
  // bakes animations and is rendering. Until confirmed, Avatar renders
  // GLTFAvatar for users of that model — this prevents the "green triangle"
  // gap where useInstancedMesh=true but InstancedAvatarRenderer hasn't loaded
  // yet (useGLTF Suspense) or is still baking.
  const [readyInstancedModels, setReadyInstancedModels] = useState<Set<string>>(
    () => new Set()
  );

  const handleModelUnsupported = useCallback((modelUrl: string) => {
    setUnsupportedInstancedModels((prev) => {
      if (prev.has(modelUrl)) return prev; // No-op → avoid re-render
      const next = new Set(prev);
      next.add(modelUrl);
      return next;
    });
    // Also remove from ready set if it was there (defensive)
    setReadyInstancedModels((prev) => {
      if (!prev.has(modelUrl)) return prev;
      const next = new Set(prev);
      next.delete(modelUrl);
      return next;
    });
  }, []);

  const handleModelReady = useCallback((modelUrl: string) => {
    setReadyInstancedModels((prev) => {
      if (prev.has(modelUrl)) return prev; // No-op → avoid re-render
      const next = new Set(prev);
      next.add(modelUrl);
      return next;
    });
  }, []);

  // ── Build instanced groups ────────────────────────────────────────────────
  // instancedGroups: models to MOUNT InstancedAvatarRenderer for (probing + rendering).
  // instancedUserIds: users whose Avatar should skip GLTFAvatar (only CONFIRMED models).
  // This 2-phase approach eliminates the green triangle:
  //   Phase 1 (mount): InstancedAvatarRenderer loads model, bakes, reports ready/unsupported
  //   Phase 2 (switch): Only after "ready" do we tell Avatar to stop rendering GLTFAvatar
  const { instancedGroups, instancedUserIds } = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    const confirmedInstancedIds = new Set<string>();

    for (const entity of fullEntities) {
      if (entity.esFantasma) continue;
      const user = usersById.get(entity.userId);
      if (!user) continue;

      // Resolve model URL from avatar3DConfig or fallback to default
      const modelUrl = user.avatar3DConfig?.modelo_url || DEFAULT_MODEL_URL;

      // Skip models known to lack embedded animations — they'll use GLTFAvatar instead
      if (unsupportedInstancedModels.has(modelUrl)) continue;

      let userSet = groups.get(modelUrl);
      if (!userSet) {
        userSet = new Set<string>();
        groups.set(modelUrl, userSet);
      }
      userSet.add(entity.userId);

      // Only mark user as "instanced" (skip GLTFAvatar) if the model is CONFIRMED ready.
      // Before confirmation, both InstancedAvatarRenderer and GLTFAvatar may render
      // for 1-2 frames (acceptable overdraw) — but no green triangle.
      if (readyInstancedModels.has(modelUrl)) {
        confirmedInstancedIds.add(entity.userId);
      }
    }

    return { instancedGroups: groups, instancedUserIds: confirmedInstancedIds };
  }, [fullEntities, usersById, unsupportedInstancedModels, readyInstancedModels]);

  return (
    <>
      {/* GPU Instanced renderers: 1 draw call per unique model URL.
        * Each wrapped in Suspense to isolate useGLTF loading — prevents
        * a slow-loading model from suspending the entire 3D scene.
        * Fallback is null: GLTFAvatar handles rendering until model is ready. */}
      {Array.from(instancedGroups.entries()).map(([modelUrl, userIds]) => (
        <Suspense key={modelUrl} fallback={null}>
          <InstancedAvatarRenderer
            modelUrl={modelUrl}
            allowedUserIds={userIds}
            onClickAvatar={onClickRemoteAvatar}
            onModelUnsupported={handleModelUnsupported}
            onModelReady={handleModelReady}
          />
        </Suspense>
      ))}

      <MidLodInstances entities={midEntities} onClick={onClickRemoteAvatar} />
      <CrowdInstances entities={crowdEntities} onClick={onClickRemoteAvatar} />
      {fullEntities.map((entity) => {
        const user = usersById.get(entity.userId);
        if (!user) return null;

        // Non-ghost avatares with instanced rendering: Avatar renders overlays only
        const isInstanced = instancedUserIds.has(entity.userId);

        return (
          <group
            key={entity.userId}
            ref={(el) => {
              if (el) groupRefs.current.set(entity.userId, el as any);
              else groupRefs.current.delete(entity.userId);
            }}
            position={[entity.currentX, 0, entity.currentZ]}
            visible={entity.isVisible}
          >
            {entity.teleportPhase === 'none' && (
              entity.esFantasma ? (
                <GhostAvatar position={[0, 0, 0]} escala={0.95} opacidad={0.3} mostrarEtiqueta={true} etiqueta="Hay alguien aquí" />
              ) : (
                <Avatar
                  position={avatarOrigin}
                  config={user.avatarConfig}
                  name={entity.name}
                  status={user.status}
                  isCurrentUser={false}
                  animationState={entity.animState}
                  direction={entity.direction}
                  reaction={remoteReaction?.from === entity.userId ? remoteReaction.emoji : null}
                  videoStream={remoteStreams.get(entity.userId) || null}
                  camOn={entity.isCameraOn}
                  showVideoBubble={showVideoBubble && !usersInCallIds?.has(entity.userId) && !!usersInAudioRangeIds?.has(entity.userId)}
                  message={remoteMessages.get(entity.userId)}
                  lodLevel={entity.lodLevel}
                  esFantasma={entity.esFantasma}
                  remoteAvatar3DConfig={user.avatar3DConfig}
                  onClickRemoteAvatar={onClickRemoteAvatar}
                  avatarInteractions={avatarInteractions}
                  userId={entity.userId}
                  useInstancedMesh={isInstanced}
                  castShadow={entity.castShadow}
                  onAvatarHeightComputed={getHeightCallback(entity.userId)}
                />
              )
            )}
            {entity.isVisible && entity.teleportPhase === 'out' && entity.teleportOrigin && (
              <TeleportEffect position={entity.teleportOrigin} phase="out" />
            )}
            {entity.isVisible && entity.teleportPhase === 'in' && entity.teleportDest && (
              <TeleportEffect position={entity.teleportDest} phase="in" />
            )}
          </group>
        );
      })}

      <AvatarLabels
        ecsVersion={renderVersion}
        showNames={true}
        currentUserId={currentUser.id}
        avatarHeights={avatarHeightsRef.current}
      />
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CAMERA FOLLOW (OrbitControls) ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export const CameraFollow: React.FC<{
  controlsRef: React.MutableRefObject<any>;
  zonasEmpresa?: ZonaEmpresa[];
  empresaId?: string | null;
  espacioObjetos?: EspacioObjeto[];
  usersInCallIds?: Set<string>;
  usersInAudioRangeIds?: Set<string>;
  /**
   * Issue 49120587 — cuando el usuario activa "Follow" sobre otro avatar,
   * `followTargetId` contiene el id del target; `getFollowTargetPosition`
   * resuelve la posición actual del avatar remoto. El CameraFollow usa esa
   * posición en vez de la del propio jugador, haciendo que la cámara orbite
   * al target. La chase-cam rotation se congela mientras dura el follow
   * (no conocemos la dirección del avatar remoto con suficiente precisión).
   */
  followTargetId?: string | null;
  getFollowTargetPosition?: (userId: string) => { x: number; z: number } | null;
  /**
   * Config adaptativa por GPU tier. Gatea FOV dinámico (tier ≥ 2).
   * Cuando es undefined o `useDynamicFov=false`, FOV se mantiene fijo.
   */
  gpuRenderConfig?: import('@/lib/gpuCapabilities').AdaptiveRenderConfig;
  /** OTS offset — 'left' | 'right' desplaza cámara lateralmente; 'center' = default. */
  cameraShoulderMode?: 'center' | 'left' | 'right';
  /**
   * Cuando `true`, la cámara hace auto-transición a overview framing
   * (bird's-eye) para que el admin pueda colocar pisos / zonas / plantillas
   * viendo todo el grid de la empresa. Fuente: `isDrawingZone` (store) OR
   * `plantillaZonaEnColocacion !== null` (prop Scene3D).
   */
  isInDrawingMode?: boolean;
  /** Centro del terreno en world coords — usado como target durante overview. */
  terrainCenter?: { x: number; z: number };
}> = ({ controlsRef, zonasEmpresa = [], empresaId = null, espacioObjetos = [], usersInCallIds, usersInAudioRangeIds, followTargetId = null, getFollowTargetPosition, gpuRenderConfig, cameraShoulderMode = 'center', isInDrawingMode = false, terrainCenter }) => {
  const { camera, scene } = useThree();
  const baseFovRef = useRef<number | null>(null);

  // ─── Camera collision (Tier 2) ────────────────────────────────────────
  // Raycaster reutilizable para detectar obstáculos entre el avatar (target)
  // y la cámara. Cuando hay hit, la cámara se acerca al target para evitar
  // que "atraviese" paredes. Patrón Unreal Spring Arm / Unity Cinemachine.
  // Ref: https://threejs.org/docs/#api/en/core/Raycaster
  // Ref: https://discussions.unity.com/t/complete-camera-collision-detection-third-person-games/593233
  const collisionRaycaster = useRef(new THREE.Raycaster());
  const collisionDirection = useRef(new THREE.Vector3());
  const collisionOrigin = useRef(new THREE.Vector3());
  const lastPlayerPos = useRef<{ x: number; z: number } | null>(null);
  const initialized = useRef(false);
  const introStartedAtRef = useRef<number | null>(null);
  const isDragging = useStore((s) => s.isDragging);

  // Chase-cam: ángulo objetivo basado en dirección del avatar
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  // Pausa auto-rotación si el usuario interactúa manualmente con la cámara
  const userInteractingRef = useRef(false);
  const lastPointerDownRef = useRef(0);

  // ─── Idle → Hero framing blend ────────────────────────────────────────
  // Cuando el avatar está quieto >IDLE_THRESHOLD_MS, la cámara hace dolly-in
  // al encuadre hero (cerca, alto, target al pecho). Al moverse, vuelve al
  // framing gameplay. Blend asimétrico: 250ms al volver a gameplay (snappy),
  // 600ms al entrar en idle (reveal cinematográfico).
  // Domain policy: src/core/domain/entities/espacio3d/CameraFramingPolicy.ts
  const idleTimeMsRef = useRef(IDLE_THRESHOLD_MS); // >=threshold para que el intro arranque en hero
  const idleBlendRef = useRef(1); // 0 = gameplay, 1 = hero. Inicia en hero.

  // ─── Drawing mode overview transition ────────────────────────────────
  // Cuando el admin entra en modo dibujo/colocación de zonas, la cámara
  // hace lerp suave a bird's-eye para ver todo el grid de la empresa
  // (50×50m). Al salir, vuelve a chase-cam. Durante drawing (no
  // transicionando), OrbitControls queda libre para zoom/pan manual.
  const wasInDrawingRef = useRef(false);
  const drawingTransitionStartedAtRef = useRef<number | null>(null);
  const drawingTransitionDirectionRef = useRef<'to-overview' | 'to-chase' | null>(null);
  // Snapshot de la posición/target de la cámara al iniciar la transición
  // (se interpolan desde este snapshot hacia el destino).
  const drawingTransitionFromRef = useRef<{
    camPos: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // Cached zone detection results — recomputed every ZONE_REEVAL_FRAMES to avoid per-frame work
  const ZONE_REEVAL_FRAMES = 30;
  const zoneFrameCounter = useRef(0);
  const cachedZoneResult = useRef<{
    usarVistaInterior: boolean;
    cameraTargetHeight: number;
    cameraHeight: number;
    cameraDistance: number;
  } | null>(null);

  const recintosCompactos = useMemo(() => {
    const grupos = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; paredes: number }>();

    espacioObjetos.forEach((objeto) => {
      const metaPlantilla = (objeto.configuracion_geometria as any)?.meta_plantilla_zona;
      const grupo = String(objeto.plantilla_origen || metaPlantilla?.zona_id || '').trim();
      const geometria = String(objeto.built_in_geometry || '').trim().toLowerCase();
      const tipo = String(objeto.tipo || '').trim().toLowerCase();
      const esPared = tipo === 'pared' || geometria.startsWith('wall') || geometria === 'pared' || geometria === 'muro';
      if (!grupo || !esPared) return;

      const dimensiones = obtenerDimensionesObjetoRuntime(objeto);
      const rotacion = objeto.rotacion_y || 0;
      const halfX = Math.abs(Math.cos(rotacion)) * (dimensiones.ancho / 2) + Math.abs(Math.sin(rotacion)) * (dimensiones.profundidad / 2);
      const halfZ = Math.abs(Math.sin(rotacion)) * (dimensiones.ancho / 2) + Math.abs(Math.cos(rotacion)) * (dimensiones.profundidad / 2);
      const actual = grupos.get(grupo);

      if (!actual) {
        grupos.set(grupo, { minX: objeto.posicion_x - halfX, maxX: objeto.posicion_x + halfX, minZ: objeto.posicion_z - halfZ, maxZ: objeto.posicion_z + halfZ, paredes: 1 });
        return;
      }

      actual.minX = Math.min(actual.minX, objeto.posicion_x - halfX);
      actual.maxX = Math.max(actual.maxX, objeto.posicion_x + halfX);
      actual.minZ = Math.min(actual.minZ, objeto.posicion_z - halfZ);
      actual.maxZ = Math.max(actual.maxZ, objeto.posicion_z + halfZ);
      actual.paredes += 1;
    });

    return Array.from(grupos.values())
      .map((g) => ({ ...g, ancho: g.maxX - g.minX, alto: g.maxZ - g.minZ }))
      .filter((g) => g.paredes >= 3 && Math.min(g.ancho, g.alto) <= 4.8);
  }, [espacioObjetos]);

  const CAMERA_INTRO_DURATION_MS = 1200;
  // El intro termina en hero framing (primer spawn = impacto avatar).
  // Ref: CameraFramingPolicy.ts — IDLE_HERO_FRAMING.
  const CAMERA_INTRO_HEIGHT = IDLE_HERO_FRAMING.height;
  const CAMERA_INTRO_DISTANCE = IDLE_HERO_FRAMING.distance;
  const CAMERA_INTRO_TARGET_HEIGHT = IDLE_HERO_FRAMING.targetHeight;
  const hayVideoProximidad = (usersInCallIds?.size || 0) > 0 || (usersInAudioRangeIds?.size || 0) > 0;
  // Framing gameplay (cuando el avatar se mueve o hay proximidad social).
  const gameplayFraming = selectGameplayFraming({ hayVideoProximidad });
  const CAMERA_DEFAULT_HEIGHT = gameplayFraming.height;
  const CAMERA_DEFAULT_DISTANCE = gameplayFraming.distance;
  const CAMERA_DEFAULT_TARGET_HEIGHT = gameplayFraming.targetHeight;

  useFrame((_, delta) => {
    const selfPos = (camera as any).userData?.playerPosition;
    const controls = controlsRef.current;
    if (!selfPos || !controls || !controls.target) return;

    // Issue 49120587 — si hay un target de follow, sustituimos la posición
    // del jugador propio por la del target remoto. El resto de la lógica
    // (zone detection, intro animation, interior camera) sigue idéntica
    // porque solo consume `playerPos`. Si el target ya no existe en el ECS,
    // caemos al comportamiento normal (cámara sobre el propio avatar).
    const targetPos = followTargetId && getFollowTargetPosition
      ? getFollowTargetPosition(followTargetId)
      : null;
    const playerPos = targetPos ?? selfPos;
    const isFollowing = targetPos !== null;

    // ─── Drawing mode overview transition ─────────────────────────────
    // Detecta transiciones de `isInDrawingMode` y hace lerp suave de la
    // cámara entre chase-cam ↔ bird's-eye del centro del terreno.
    // Durante drawing (no transicionando), OrbitControls queda libre
    // para que el admin haga zoom/pan/rotate manualmente al colocar pisos.
    if (isInDrawingMode !== wasInDrawingRef.current) {
      // Transición detectada — snapshot de posición actual + dirección.
      drawingTransitionFromRef.current = {
        camPos: camera.position.clone(),
        target: controls.target.clone(),
      };
      drawingTransitionStartedAtRef.current = performance.now();
      drawingTransitionDirectionRef.current = isInDrawingMode ? 'to-overview' : 'to-chase';
      wasInDrawingRef.current = isInDrawingMode;
    }

    if (drawingTransitionStartedAtRef.current !== null && drawingTransitionFromRef.current) {
      const elapsed = performance.now() - drawingTransitionStartedAtRef.current;
      const progress = Math.min(elapsed / TRANSITION_TO_DRAWING_MS, 1);
      // Ease-in-out cúbico (mismo pattern que el intro).
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const dir = drawingTransitionDirectionRef.current;
      const from = drawingTransitionFromRef.current;

      if (dir === 'to-overview') {
        // Destino: bird's-eye del centro del terreno. Si no hay terrainCenter
        // (edge case), usamos la posición actual del jugador como fallback.
        const cx = terrainCenter?.x ?? playerPos.x;
        const cz = terrainCenter?.z ?? playerPos.z;
        const toTarget = new THREE.Vector3(cx, DRAWING_OVERVIEW_FRAMING.targetHeight, cz);
        // Cámara en ángulo isométrico desde el sur-oeste del centro.
        const toCamPos = new THREE.Vector3(
          cx - DRAWING_OVERVIEW_FRAMING.distance * 0.7,
          DRAWING_OVERVIEW_FRAMING.height,
          cz + DRAWING_OVERVIEW_FRAMING.distance * 0.7,
        );
        controls.target.lerpVectors(from.target, toTarget, eased);
        camera.position.lerpVectors(from.camPos, toCamPos, eased);
        controls.update();
      } else if (dir === 'to-chase') {
        // Destino: chase-cam sobre el avatar. Se reutiliza el framing
        // gameplay default como target (el idle-hero se re-activará luego).
        const toTarget = new THREE.Vector3(playerPos.x, CAMERA_DEFAULT_TARGET_HEIGHT, playerPos.z);
        const toCamPos = new THREE.Vector3(
          playerPos.x,
          CAMERA_DEFAULT_HEIGHT,
          playerPos.z + CAMERA_DEFAULT_DISTANCE,
        );
        controls.target.lerpVectors(from.target, toTarget, eased);
        camera.position.lerpVectors(from.camPos, toCamPos, eased);
        controls.update();
      }

      if (progress >= 1) {
        drawingTransitionStartedAtRef.current = null;
        drawingTransitionDirectionRef.current = null;
        drawingTransitionFromRef.current = null;
      }
      return; // No ejecutar chase-cam durante la transición.
    }

    // Si está en drawing mode sin transicionar, dejar OrbitControls libre
    // (user controla zoom/pan/rotate para colocar el piso).
    if (isInDrawingMode) {
      return;
    }

    // Zone/interior detection: only recompute every ZONE_REEVAL_FRAMES
    zoneFrameCounter.current += 1;
    if (!cachedZoneResult.current || zoneFrameCounter.current >= ZONE_REEVAL_FRAMES) {
      zoneFrameCounter.current = 0;
      const zonaPropia = empresaId ? zonasEmpresa.find((z) => z.empresa_id === empresaId && z.estado === 'activa') || null : null;
      const anchoZona = zonaPropia ? Math.max(Number(zonaPropia.ancho) / 16, 0) : 0;
      const altoZona = zonaPropia ? Math.max(Number(zonaPropia.alto) / 16, 0) : 0;
      const centroZonaX = zonaPropia ? Number(zonaPropia.posicion_x) / 16 : 0;
      const centroZonaZ = zonaPropia ? Number(zonaPropia.posicion_y) / 16 : 0;
      const halfW = anchoZona / 2;
      const halfH = altoZona / 2;
      const dimensionMinima = Math.min(anchoZona || Number.POSITIVE_INFINITY, altoZona || Number.POSITIVE_INFINITY);
      const estaDentroZonaPropia = !!zonaPropia && Math.abs(playerPos.x - centroZonaX) <= halfW && Math.abs(playerPos.z - centroZonaZ) <= halfH;
      const recintoCompacto = recintosCompactos.find((g) => playerPos.x >= g.minX + 0.12 && playerPos.x <= g.maxX - 0.12 && playerPos.z >= g.minZ + 0.12 && playerPos.z <= g.maxZ - 0.12) || null;
      const dimensionMinimaRecinto = recintoCompacto ? Math.min(recintoCompacto.ancho, recintoCompacto.alto) : null;
      const usarVistaInterior = Boolean(recintoCompacto) || (estaDentroZonaPropia && Number.isFinite(dimensionMinima) && dimensionMinima <= 5);
      const dimensionBaseInterior = dimensionMinimaRecinto ?? dimensionMinima;
      cachedZoneResult.current = {
        usarVistaInterior,
        cameraTargetHeight: usarVistaInterior ? 1.2 : CAMERA_DEFAULT_TARGET_HEIGHT,
        cameraHeight: usarVistaInterior ? THREE.MathUtils.clamp(dimensionBaseInterior * 0.58, 2.1, 3.1) : CAMERA_DEFAULT_HEIGHT,
        cameraDistance: usarVistaInterior ? THREE.MathUtils.clamp(dimensionBaseInterior * 0.42, 1.55, 2.7) : CAMERA_DEFAULT_DISTANCE,
      };
    }

    const { usarVistaInterior } = cachedZoneResult.current;
    let { cameraTargetHeight, cameraHeight, cameraDistance } = cachedZoneResult.current;

    // ─── Idle blend (hero framing cuando el avatar está quieto) ──────────
    // El blend se calcula per-frame (no cacheado) porque el threshold/timings
    // son sub-segundo. Usa MathUtils.damp para frame-rate independence
    // (ref: https://threejs.org/docs/#api/en/math/MathUtils.damp).
    // Signal: camera.userData.playerMoving escrito por Player3D cada frame.
    // Blend se desactiva dentro de recintos compactos (vista interior ya
    // maneja su propio framing) y al seguir a un remoto (isFollowing).
    const playerMovingForIdle = (camera as any).userData?.playerMoving as boolean | undefined;
    if (playerMovingForIdle) {
      idleTimeMsRef.current = 0;
    } else {
      idleTimeMsRef.current += delta * 1000;
    }
    const wantIdleHero = !usarVistaInterior && !isFollowing && idleTimeMsRef.current >= IDLE_THRESHOLD_MS;
    const idleTargetBlend = wantIdleHero ? 1 : 0;
    // Asimetría: entrar en idle más lento (reveal cinematográfico),
    // salir más rápido (input del usuario debe sentirse inmediato).
    const transitionMs = wantIdleHero ? TRANSITION_TO_IDLE_MS : TRANSITION_TO_MOVING_MS;
    const lambda = dampLambdaForDurationMs(transitionMs);
    idleBlendRef.current = THREE.MathUtils.damp(idleBlendRef.current, idleTargetBlend, lambda, delta);

    // Aplica blend solo fuera de vista interior y follow remoto.
    if (!usarVistaInterior && !isFollowing && idleBlendRef.current > 0.001) {
      const b = idleBlendRef.current;
      cameraDistance = THREE.MathUtils.lerp(cameraDistance, IDLE_HERO_FRAMING.distance, b);
      cameraHeight = THREE.MathUtils.lerp(cameraHeight, IDLE_HERO_FRAMING.height, b);
      cameraTargetHeight = THREE.MathUtils.lerp(cameraTargetHeight, IDLE_HERO_FRAMING.targetHeight, b);
    }

    controls.enabled = !isDragging;
    controls.minDistance = usarVistaInterior ? 1.05 : 1.1;
    controls.maxDistance = usarVistaInterior ? Math.max(cameraDistance + 1.1, 3.2) : 50;

    const moved = !lastPlayerPos.current || Math.abs(playerPos.x - lastPlayerPos.current.x) > 0.001 || Math.abs(playerPos.z - lastPlayerPos.current.z) > 0.001;

    if (!initialized.current) {
      controls.target.set(playerPos.x, CAMERA_INTRO_TARGET_HEIGHT, playerPos.z);
      camera.position.set(playerPos.x, CAMERA_INTRO_HEIGHT, playerPos.z + CAMERA_INTRO_DISTANCE);
      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
      initialized.current = true;
      introStartedAtRef.current = performance.now();
      return;
    }

    if (introStartedAtRef.current !== null) {
      const elapsed = performance.now() - introStartedAtRef.current;
      const progress = Math.min(elapsed / CAMERA_INTRO_DURATION_MS, 1);
      const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      controls.target.set(playerPos.x, THREE.MathUtils.lerp(CAMERA_INTRO_TARGET_HEIGHT, cameraTargetHeight, easedProgress), playerPos.z);
      camera.position.set(playerPos.x, THREE.MathUtils.lerp(CAMERA_INTRO_HEIGHT, cameraHeight, easedProgress), playerPos.z + THREE.MathUtils.lerp(CAMERA_INTRO_DISTANCE, cameraDistance, easedProgress));
      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
      if (progress >= 1) introStartedAtRef.current = null;
      return;
    }

    // ── Chase-cam: dirección → ángulo objetivo ──
    // Mapeo de las 8 direcciones del avatar a ángulos en radianes.
    // La cámara se posiciona DETRÁS del avatar (ángulo + PI).
    // Ref: Three.js OrbitControls spherical coordinate system
    const playerDir = (camera as any).userData?.playerDirection as string | undefined;
    const playerMoving = (camera as any).userData?.playerMoving as boolean | undefined;

    const DIRECTION_TO_ANGLE: Record<string, number> = {
      front: 0,            // avatar mira hacia -Z → cámara detrás en +Z
      back: Math.PI,       // avatar mira hacia +Z → cámara detrás en -Z
      left: Math.PI / 2,   // avatar mira hacia -X → cámara detrás en +X
      right: -Math.PI / 2, // avatar mira hacia +X → cámara detrás en -X
      up: 0,               // alias de front en algunos mapeos
    };

    // Chase-cam SOLO sobre el avatar propio. Al estar siguiendo a otro usuario
    // no tenemos `playerDirection` fiable del remoto, así que congelamos el
    // ángulo objetivo — la cámara orbita al target manteniendo la orientación
    // actual y el usuario puede rotar con el mouse.
    if (!isFollowing && playerDir && playerMoving && DIRECTION_TO_ANGLE[playerDir] !== undefined) {
      targetAngleRef.current = DIRECTION_TO_ANGLE[playerDir];
      // Reset user interaction flag cuando el avatar se mueve
      // (el usuario espera que la cámara siga)
      if (Date.now() - lastPointerDownRef.current > 2000) {
        userInteractingRef.current = false;
      }
    }

    if (moved && lastPlayerPos.current) {
      const deltaX = playerPos.x - lastPlayerPos.current.x;
      const deltaZ = playerPos.z - lastPlayerPos.current.z;

      // Seguir posición del avatar (siempre)
      controls.target.x += deltaX;
      controls.target.z += deltaZ;

      // Chase-cam rotation: rotar offset alrededor del avatar
      // Solo si el usuario no está interactuando manualmente con la cámara
      if (!userInteractingRef.current && !usarVistaInterior) {
        // Lerp suave del ángulo actual al objetivo
        const angleDiff = targetAngleRef.current - currentAngleRef.current;
        // Normalizar diferencia al rango [-PI, PI]
        const normalizedDiff = ((angleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        currentAngleRef.current += normalizedDiff * 0.025; // Factor de lerp suave

        // Calcular nueva posición de cámara basada en ángulo rotado
        const targetCamX = controls.target.x + Math.sin(currentAngleRef.current) * cameraDistance;
        const targetCamZ = controls.target.z + Math.cos(currentAngleRef.current) * cameraDistance;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.04);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.04);
      } else {
        // Modo manual o interior: mover cámara con offset fijo (comportamiento original)
        camera.position.x += deltaX;
        camera.position.z += deltaZ;
      }

      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
    }

    const offsetX = camera.position.x - controls.target.x;
    const offsetZ = camera.position.z - controls.target.z;
    const distanciaHorizontalActual = Math.max(Math.hypot(offsetX, offsetZ), 0.001);
    const smoothing = usarVistaInterior ? 0.18 : 0.1;
    const offsetYActual = camera.position.y - controls.target.y;

    // Sincronizar currentAngle con la posición real de la cámara
    // (permite que OrbitControls manual actualice el ángulo)
    currentAngleRef.current = Math.atan2(offsetX, offsetZ);

    controls.target.y = THREE.MathUtils.lerp(controls.target.y, cameraTargetHeight, smoothing);

    // Pull-in activo: dentro de recintos compactos (siempre) o durante el
    // blend hero-idle (fuera de interior y sin follow). El blend lerpea
    // `cameraDistance/Height/TargetHeight` hacia IDLE_HERO_FRAMING, pero
    // OrbitControls no mueve camera.position.y ni la radial automáticamente
    // — hay que tirarla activamente aquí (pattern Cinemachine dolly).
    const pullInActive = usarVistaInterior || (!isFollowing && idleBlendRef.current > 0.01);

    if (pullInActive && distanciaHorizontalActual > cameraDistance + 0.08) {
      const factorDistancia = cameraDistance / distanciaHorizontalActual;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, controls.target.x + (offsetX * factorDistancia), smoothing);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, controls.target.z + (offsetZ * factorDistancia), smoothing);
    }

    if (pullInActive) {
      const alturaRelativaObjetivo = Math.max(cameraHeight - cameraTargetHeight, 1.05);
      if (offsetYActual > alturaRelativaObjetivo + 0.35 && distanciaHorizontalActual > cameraDistance + 0.04) {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, controls.target.y + alturaRelativaObjetivo, smoothing * 0.9);
      }
    }

    // ─── Camera collision — pull-in cuando hay obstáculo entre target y cámara ──
    // Un raycast desde el target hacia la cámara detecta geometría bloqueante.
    // Si hay hit más cerca que la distancia deseada, aproximamos la cámara al
    // punto de impacto (menos padding 0.2) con lerp suave para evitar snap.
    //
    // Filtrado: ignora SkinnedMesh (avatars), Sprite (labels), InstancedMesh
    // con userData.cameraIgnore=true, meshes con material.transparent (burbujas),
    // y cualquier mesh cuyo nombre contenga 'ui', 'label', 'bubble', 'sky'.
    // Esto evita que partículas, etiquetas flotantes y el skydome activen la
    // colisión. Ref: Three.js Raycaster docs + Unity best practice "layer mask".
    collisionOrigin.current.set(controls.target.x, controls.target.y, controls.target.z);
    collisionDirection.current.set(
      camera.position.x - controls.target.x,
      camera.position.y - controls.target.y,
      camera.position.z - controls.target.z,
    );
    const desiredDistance = collisionDirection.current.length();
    if (desiredDistance > 0.1) {
      collisionDirection.current.normalize();
      collisionRaycaster.current.set(collisionOrigin.current, collisionDirection.current);
      collisionRaycaster.current.far = desiredDistance;
      collisionRaycaster.current.near = 0.2;
      // Fix crítico (2026-04-21): Three.js requiere `raycaster.camera` seteado
      // cuando el grafo contiene `THREE.Sprite` (labels de avatares, burbujas).
      // Sin esto, al testear un Sprite el raycast lee `matrixWorld` de un
      // objeto no preparado y lanza `Cannot read properties of null`. El
      // error se dispara en cada frame del useFrame → spam → congelación.
      // Ref: https://threejs.org/docs/#api/en/core/Raycaster (section Sprites)
      //      https://threejs.org/docs/#api/en/objects/Sprite
      collisionRaycaster.current.camera = camera;
      const hits = collisionRaycaster.current.intersectObjects(scene.children, true);
      // Filtro: el primer hit que sea "camera blocker" (geometría sólida).
      let firstBlocker: THREE.Intersection | null = null;
      for (const hit of hits) {
        const obj = hit.object as THREE.Mesh;
        // Skip: SkinnedMesh, Sprite, meshes UI/transparentes, skydome, flag explícito.
        if ((obj as any).isSkinnedMesh) continue;
        if ((obj as any).isSprite) continue;
        if (obj.userData?.cameraIgnore === true) continue;
        const name = (obj.name || '').toLowerCase();
        if (name.includes('sky') || name.includes('label') || name.includes('bubble') || name.includes('ui')) continue;
        // material transparent => burbuja de video, emoji reaction, etc.
        const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
        const matArr = Array.isArray(mat) ? mat : (mat ? [mat] : []);
        if (matArr.some((m) => m && (m as any).transparent === true)) continue;
        firstBlocker = hit;
        break;
      }
      if (firstBlocker) {
        // Mover cámara al hit - padding. Lerp 0.25 → transición rápida (cámara
        // dentro de pared es molesta) pero no snap (evita jitter si el hit
        // oscila entre frames por physics).
        const pulledDistance = Math.max(firstBlocker.distance - 0.2, 0.3);
        const tx = controls.target.x + collisionDirection.current.x * pulledDistance;
        const ty = controls.target.y + collisionDirection.current.y * pulledDistance;
        const tz = controls.target.z + collisionDirection.current.z * pulledDistance;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.25);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.25);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, tz, 0.25);
      }
    }

    // ─── FOV dinámico (Tier 2) — feel de velocidad al correr ─────────────
    // Lectura del animState vía userData (pub/sub con Player3D, zero coupling).
    // Valores: run=55°, walk=52°, idle/sit=50° (base). Lerp suave 0.05 para
    // que la transición sea orgánica (no snap al presionar shift).
    // Ref: GTA V / Forza / Zelda BOTW pattern.
    if (gpuRenderConfig?.useDynamicFov && !usarVistaInterior && !isFollowing) {
      const persp = camera as THREE.PerspectiveCamera;
      if (persp.isPerspectiveCamera) {
        if (baseFovRef.current === null) baseFovRef.current = persp.fov;
        const baseFov = baseFovRef.current;
        const animState = (camera as any).userData?.playerAnimState as string | undefined;
        const targetFov = animState === 'run' ? baseFov + 5 : animState === 'walk' ? baseFov + 2 : baseFov;
        const newFov = THREE.MathUtils.lerp(persp.fov, targetFov, 0.05);
        if (Math.abs(newFov - persp.fov) > 0.01) {
          persp.fov = newFov;
          persp.updateProjectionMatrix();
        }
      }
    }

    // ─── OTS offset (Tier 2, opt-in via setting) ─────────────────────────
    // Desplaza el target lateralmente según la orientación cámara→avatar, de
    // modo que el avatar quede ligeramente descentrado a un hombro. Más
    // cinemático que vista centrada pura. Solo cuando el usuario lo activa
    // explícitamente en settings (default: 'center' = comportamiento actual).
    // Ref: GTA V shoulder swap, Fortnite L/R toggle, Witcher 3 OTS.
    if (cameraShoulderMode !== 'center' && !usarVistaInterior && !isFollowing) {
      const shoulderSign = cameraShoulderMode === 'right' ? 1 : -1;
      const shoulderOffset = 0.3;
      // Vector perpendicular a la dirección cámara→avatar en el plano XZ.
      const dx = camera.position.x - controls.target.x;
      const dz = camera.position.z - controls.target.z;
      const len = Math.hypot(dx, dz) || 1;
      const perpX = -dz / len;
      const perpZ = dx / len;
      controls.target.x = THREE.MathUtils.lerp(controls.target.x, playerPos.x + perpX * shoulderOffset * shoulderSign, 0.12);
      controls.target.z = THREE.MathUtils.lerp(controls.target.z, playerPos.z + perpZ * shoulderOffset * shoulderSign, 0.12);
    }

    controls.update();
  }, -1);

  // Detectar interacción manual del usuario con OrbitControls
  // Si el usuario arrastra la cámara manualmente, pausar auto-rotation
  // del chase-cam durante 2 segundos para no interferir.
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const onPointerDown = () => {
      userInteractingRef.current = true;
      lastPointerDownRef.current = Date.now();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AVATAR SCREEN PROJECTOR ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export const AvatarScreenProjector: React.FC<{
  selectedUserId: string | null;
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  screenPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onlineUsers: User[];
}> = ({ selectedUserId, ecsStateRef, screenPosRef, onlineUsers }) => {
  const { camera, gl } = useThree();
  const vec3 = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!selectedUserId) { screenPosRef.current = null; return; }
    const ecsData = obtenerEstadoUsuarioEcs(ecsStateRef.current, selectedUserId);
    let wx: number, wz: number;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 3000) {
      wx = ecsData.x; wz = ecsData.z;
    } else {
      const u = onlineUsers.find(u => u.id === selectedUserId);
      if (!u) { screenPosRef.current = null; return; }
      wx = u.x / 16; wz = u.y / 16;
    }
    vec3.set(wx, 3.5, wz);
    vec3.project(camera);
    const canvas = gl.domElement;
    screenPosRef.current = {
      x: (vec3.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-vec3.y * 0.5 + 0.5) * canvas.clientHeight,
    };
  });

  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TELEPORT EFFECT ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export const TeleportEffect: React.FC<{ position: [number, number, number]; phase: 'out' | 'in' }> = ({ position, phase }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startTime = useRef(Date.now());

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    const elapsed = (Date.now() - startTime.current) / 1000;
    const t = Math.min(elapsed / 0.35, 1);

    if (phase === 'out') {
      meshRef.current.scale.setScalar(1 + t * 3);
      materialRef.current.opacity = 0.8 * (1 - t);
    } else {
      meshRef.current.scale.setScalar(4 - t * 3);
      materialRef.current.opacity = 0.8 * t * (1 - t * 0.5);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} geometry={teleportRingGeometry}>
        <meshBasicMaterial ref={materialRef} color="#818cf8" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#818cf8" intensity={phase === 'out' ? 5 : 8} distance={6} />
    </group>
  );
};
