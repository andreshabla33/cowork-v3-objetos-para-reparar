'use client';
import React, { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '@/modules/avatar3d/presentation/GLTFAvatar';
import type { AnimationState, AvatarAssetQuality, Avatar3DConfig } from '@/modules/avatar3d/presentation/shared';
import { resolveAvatarModelUrl } from '@/modules/avatar3d/presentation/shared';
import { GhostAvatar } from '@/modules/space3d/presentation/world/GhostAvatar';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/core/infrastructure/r3f/ecs/espacioEcs';
import { getSettingsSection, subscribeToSettings } from '@/core/infrastructure/userSettings/userSettings';
import {
  AvatarLodLevel, DireccionAvatar,
  TELEPORT_DISTANCE, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE, CULL_DISTANCE,
  obtenerDireccionDesdeVector
} from './shared';
import type { LocalVideoTrack } from 'livekit-client';
import { statusColors, type VirtualSpace3DProps } from './spaceTypes';
import { StableVideo } from './Overlays';
import { VideoWithBackground } from '@/modules/realtime-room/presentation/VideoWithBackground';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';

// ECS imports (PR-6/7/9/10)
import { avatarStore } from '@/core/infrastructure/r3f/ecs/AvatarECS';
import { movementSystem, cullingSystem, animationSystem } from '@/core/infrastructure/r3f/ecs/AvatarSystems';

// Shared singleton geometries — prevent geometry leak on re-render (DEBT-004)
import {
  hitTestCylinderCurrentUser,
  hitTestCylinderRemote,
  crowdMarkerGeometry,
  teleportCylinderGeometry,
  teleportRingGeometry,
} from '@/modules/space3d/presentation/world/sharedGeometries';
import { resolveAvatarRenderPolicy, resolveEffectiveGraphicsQuality } from '@/core/infrastructure/r3f/ecs/avatarRenderPolicy';
import { getGpuInfoSync } from '@/core/infrastructure/r3f/gpuCapabilities';
import { AvatarRuntimeScheduler, resolveAvatarRuntimePolicy } from '@/core/infrastructure/r3f/ecs/avatarRuntimeScheduler';
import { SpatialGrid } from '@/core/infrastructure/r3f/spatial/SpatialGrid';
import { frameMetrics } from '@/core/infrastructure/observability/frameMetrics';
import { AvatarLabels } from '@/modules/space3d/presentation/world/AvatarLabels';
import { CrowdInstances, type CrowdEntity } from './CrowdInstances';
import { MidLodInstances, type MidLodEntity } from './MidLodInstances';
import { InstancedAvatarRenderer } from '@/modules/space3d/presentation/world/InstancedAvatarRenderer';
import { DEFAULT_MODEL_URL } from '@/modules/avatar3d/presentation/shared';
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
  const avatar3DConfig = useStore(s => s.avatar3DConfig);
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
  const currentUser = useStore(s => s.currentUser);
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

    // 2. Alimentar desde ECS state (fallback Presence-fed)
    //
    // FIX 2026-05-08: este path viene de Supabase Presence (CRDT, throttled
    // 45s) → coords stale. NO debe pasar por movementSystem.setTarget
    // porque setTarget setea hasReceivedFirstRealTarget=true, y ese flag
    // semánticamente representa "primer snapshot AUTHORITATIVE recibido"
    // (Source/Valve net-code). Reservar el flag para path DataChannel
    // (línea ~515) que sí es authoritative.
    //
    // Bypass: escribir target directo + metadata sin tocar el flag. Si
    // este path es la única fuente para una entity, el avatar usa coords
    // stale provisorias hasta que llegue el primer DataChannel packet —
    // que entonces sí setea el flag y ejecuta el snap inicial documentado.
    //
    // Esto preserva el patrón de useProximity guard: proximidad/cámaras
    // solo activan tras DataChannel-confirmed coords, evitando activación
    // falsa por coords stale de Presence.
    if (ecsStateRef?.current) {
      for (const entity of avatarStore.getAll()) {
        const ecsData = obtenerEstadoUsuarioEcs(ecsStateRef.current, entity.userId);
        if (!ecsData || Date.now() - (ecsData.timestamp ?? 0) > 2000) continue;
        if (entity.lastServerUpdate > Date.now() - 1500) continue;
        entity.targetX = ecsData.x;
        entity.targetZ = ecsData.z;
        if (ecsData.direction !== undefined) entity.direction = ecsData.direction;
        if (ecsData.isMoving !== undefined) entity.isMoving = ecsData.isMoving;
        // hasReceivedFirstRealTarget se mantiene en su valor actual.
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
// ─── CAMERA FOLLOW — extraído a ./CameraFollow.tsx (ITEM 15, 2026-05-12) ────
// ═══════════════════════════════════════════════════════════════════════════════
// Re-export para preservar el barrel de `InternalComponents.tsx`. La
// implementación íntegra (~590 LOC: chase-cam + idle-hero blend + drawing
// overview + camera collision + FOV dinámico + OTS + auto-return tras zoom)
// vive ahora en su propio archivo.
export { CameraFollow } from './CameraFollow';


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
