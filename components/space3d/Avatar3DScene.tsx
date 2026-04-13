'use client';
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import type { AnimationState, AvatarAssetQuality, Avatar3DConfig } from '../avatar3d/shared';
import { GhostAvatar } from '../3d/GhostAvatar';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { useStore } from '@/store/useStore';
import { obtenerDimensionesObjetoRuntime } from './objetosRuntime';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { getSettingsSection, subscribeToSettings } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar,
  TELEPORT_DISTANCE, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE, CULL_DISTANCE,
  playTeleportSound, obtenerDireccionDesdeVector
} from './shared';
import { statusColors, type VirtualSpace3DProps } from './spaceTypes';
import { StableVideo } from './Overlays';

// ECS imports (PR-6/7/9/10)
import { avatarStore } from '@/lib/ecs/AvatarECS';
import { movementSystem, cullingSystem, animationSystem } from '@/lib/ecs/AvatarSystems';

// Shared singleton geometries — prevent geometry leak on re-render (DEBT-004)
import {
  hitTestCylinderCurrentUser,
  hitTestCylinderRemote,
  statusDotGeometry,
  crowdMarkerGeometry,
  teleportCylinderGeometry,
  teleportRingGeometry,
} from '../3d/sharedGeometries';
import { resolveAvatarRenderPolicy } from '@/lib/ecs/avatarRenderPolicy';
import { AvatarRuntimeScheduler, resolveAvatarRuntimePolicy } from '@/lib/ecs/avatarRuntimeScheduler';
import { SpatialGrid } from '@/lib/spatial/SpatialGrid';
import { frameMetrics } from '@/lib/metrics/frameMetrics';
import { AvatarLabels } from '../3d/AvatarLabels';
import { CrowdInstances, type CrowdEntity } from './CrowdInstances';
import { MidLodInstances, type MidLodEntity } from './MidLodInstances';
import { InstancedAvatarRenderer } from '../3d/InstancedAvatarRenderer';
import { DEFAULT_MODEL_URL } from '../avatar3d/shared';

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

// ─── Labels de estado ────────────────────────────────────────────────────────
const STATUS_LABELS: Record<PresenceStatus, string> = {
  [PresenceStatus.AVAILABLE]: 'Disponible',
  [PresenceStatus.BUSY]: 'Ocupado',
  [PresenceStatus.AWAY]: 'Ausente',
  [PresenceStatus.DND]: 'No molestar',
};

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
  reaction, videoStream, videoIsProcessed = false,
  camOn, showVideoBubble = true, message,
  onClickAvatar, onClickRemoteAvatar, userId,
  mirrorVideo: mirrorVideoProp, hideSelfView: hideSelfViewProp,
  showName: showNameProp, lodLevel: lodLevelProp,
  esFantasma = false, remoteAvatar3DConfig,
  onAvatarHeightComputed, onMetricasAvatarComputadas,
  avatarInteractions, useInstancedMesh = false, castShadow = true
}) => {
  const [showStatusLabel, setShowStatusLabel] = useState(false);
  const [showRadialWheel, setShowRadialWheel] = useState(false);
  const [avatarHeight, setAvatarHeight] = useState(2.0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef(0);
  const clickPreventedRef = useRef(false);
  const { avatar3DConfig } = useStore();

  const videoSettings = useMemo(() => getSettingsSection('video'), []);
  const space3dS = useMemo(() => getSettingsSection('space3d'), []);
  const perfS = useMemo(() => getSettingsSection('performance'), []);
  const mirrorVideo = mirrorVideoProp ?? videoSettings.mirrorVideo ?? true;
  const hideSelfView = hideSelfViewProp ?? videoSettings.hideSelfView ?? false;
  const showName = showNameProp ?? space3dS.showNamesAboveAvatars ?? true;
  const lodLevel = lodLevelProp ?? 'high';
  const showHigh = lodLevel === 'high';
  const showMid = lodLevel === 'mid';
  const showLow = lodLevel === 'low';
  const esMismaEmpresa = !esFantasma && !isCurrentUser;
  // When useInstancedMesh=true, the 3D mesh is handled by InstancedAvatarRenderer.
  // Skip GLTFAvatar to avoid double-rendering the same avatar.
  const renderGLTF = !useInstancedMesh && (showHigh || (esMismaEmpresa && showMid));
  const renderSprite = !renderGLTF && (showMid || showLow);
  const assetQuality: AvatarAssetQuality = showLow ? 'low' : showMid ? 'medium' : 'high';
  const effectiveAnimState = perfS.showAvatarAnimations === false ? 'idle' as AnimationState : animationState;

  const nameY = avatarHeight + 0.4;
  const videoY = avatarHeight + 1.15;
  const chatY = avatarHeight + (camOn ? 2.75 : 0.95);
  const reactionY = avatarHeight + (camOn ? 1.75 : 0.65);
  const radialY = avatarHeight + (camOn ? 2.05 : 0.65);
  const allowName = showName && (!camOn || !(showHigh || showMid)) && (esMismaEmpresa || lodLevel !== 'low');
  const allowVideo = (showHigh || showMid) && camOn;
  const allowMessage = showHigh && message;
  const allowReaction = (showHigh || showMid) && reaction;
  const spriteColor = isCurrentUser ? '#60a5fa' : statusColors[status];

  useEffect(() => {
    if (onAvatarHeightComputed && avatarHeight > 0) onAvatarHeightComputed(avatarHeight);
  }, [avatarHeight, onAvatarHeightComputed]);

  useEffect(() => {
    if (showStatusLabel) {
      const timer = setTimeout(() => setShowStatusLabel(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showStatusLabel]);

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
        <GLTFAvatar
          key={`${isCurrentUser ? (avatar3DConfig?.modelo_url || 'default') : (remoteAvatar3DConfig?.modelo_url || 'remote')}:${assetQuality}`}
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
            {videoStream && videoStream.getVideoTracks().length > 0 ? (
              <StableVideo stream={videoStream} muted={isCurrentUser} className={`w-full h-full object-cover ${isCurrentUser && mirrorVideo && !videoIsProcessed ? '-scale-x-100' : ''}`} />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-indigo-900/80 to-purple-900/80">
                <span className="text-[9px] text-white/80 font-medium">{name.split(' ')[0]}</span>
              </div>
            )}
          </div>
        </Html>
      )}

      {allowReaction && (
        <Html position={[0, reactionY, 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
          <div className="animate-emoji-float text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">{reaction}</div>
        </Html>
      )}

      {!allowVideo && allowName && (
        <Billboard position={[0, nameY, 0]} follow lockX={false} lockY={false} lockZ={false}>
          <group>
            <Text position={[0, 0, 0]} fontSize={0.24} color={isCurrentUser ? '#60a5fa' : '#ffffff'} anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000000" renderOrder={10} depthOffset={-1} onClick={(e) => { e.stopPropagation(); !isCurrentUser && setShowStatusLabel(true); }}>
              {name}
            </Text>
            <mesh position={[name.length * 0.08 + 0.05, 0, 0]} geometry={statusDotGeometry}>
              <meshBasicMaterial color={statusColors[status]} />
            </mesh>
          </group>
          {showStatusLabel && !isCurrentUser && (
            <Html position={[0, 0.45, 0]} center zIndexRange={[200, 0]}>
              <div className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white shadow-lg whitespace-nowrap" style={{ backgroundColor: statusColors[status] }}>
                {STATUS_LABELS[status]}
              </div>
            </Html>
          )}
        </Billboard>
      )}

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
  const performanceSettings = useMemo(() => getSettingsSection('performance'), [settingsVersion]);

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
      graphicsQuality: performanceSettings.graphicsQuality,
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
        graphicsQuality: performanceSettings.graphicsQuality,
        avatarCount: avatarStore.size,
        documentVisible: isDocumentVisibleRef.current,
      });
    }

    if (runtimeDecision.runAnimation) {
      animationSystem.update(delta, {
        graphicsQuality: performanceSettings.graphicsQuality,
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
    graphicsQuality: performanceSettings.graphicsQuality,
    avatarCount: visibleEntities.length,
    documentVisible: isDocumentVisibleRef.current,
  }), [performanceSettings.graphicsQuality, visibleEntities.length]);
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
  const { instancedGroups, instancedUserIds } = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    const allInstancedIds = new Set<string>();

    for (const entity of fullEntities) {
      if (entity.esFantasma) continue;
      const user = usersById.get(entity.userId);
      if (!user) continue;

      // Resolve model URL from avatar3DConfig or fallback to default
      const modelUrl = user.avatar3DConfig?.modelo_url || DEFAULT_MODEL_URL;

      let userSet = groups.get(modelUrl);
      if (!userSet) {
        userSet = new Set<string>();
        groups.set(modelUrl, userSet);
      }
      userSet.add(entity.userId);
      allInstancedIds.add(entity.userId);
    }

    return { instancedGroups: groups, instancedUserIds: allInstancedIds };
  }, [fullEntities, usersById]);

  return (
    <>
      {/* GPU Instanced renderers: 1 draw call per unique model URL */}
      {Array.from(instancedGroups.entries()).map(([modelUrl, userIds]) => (
        <InstancedAvatarRenderer
          key={modelUrl}
          modelUrl={modelUrl}
          allowedUserIds={userIds}
          onClickAvatar={onClickRemoteAvatar}
        />
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

      <AvatarLabels ecsVersion={renderVersion} showNames={true} />
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CAMERA FOLLOW (OrbitControls) ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export const CameraFollow: React.FC<{ controlsRef: React.MutableRefObject<any>; zonasEmpresa?: ZonaEmpresa[]; empresaId?: string | null; espacioObjetos?: EspacioObjeto[]; usersInCallIds?: Set<string>; usersInAudioRangeIds?: Set<string> }> = ({ controlsRef, zonasEmpresa = [], empresaId = null, espacioObjetos = [], usersInCallIds, usersInAudioRangeIds }) => {
  const { camera } = useThree();
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
  const CAMERA_INTRO_HEIGHT = 11;
  const CAMERA_INTRO_DISTANCE = 12;
  const CAMERA_INTRO_TARGET_HEIGHT = 0.8;
  const hayVideoProximidad = (usersInCallIds?.size || 0) > 0 || (usersInAudioRangeIds?.size || 0) > 0;
  const CAMERA_DEFAULT_HEIGHT = hayVideoProximidad ? 5.2 : 4.45;
  const CAMERA_DEFAULT_DISTANCE = hayVideoProximidad ? 6.8 : 5.35;
  const CAMERA_DEFAULT_TARGET_HEIGHT = hayVideoProximidad ? 1.26 : 1.18;

  useFrame(() => {
    const playerPos = (camera as any).userData?.playerPosition;
    const controls = controlsRef.current;
    if (!playerPos || !controls || !controls.target) return;

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

    const { usarVistaInterior, cameraTargetHeight, cameraHeight, cameraDistance } = cachedZoneResult.current;

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

    if (playerDir && playerMoving && DIRECTION_TO_ANGLE[playerDir] !== undefined) {
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

    if (usarVistaInterior && distanciaHorizontalActual > cameraDistance + 0.08) {
      const factorDistancia = cameraDistance / distanciaHorizontalActual;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, controls.target.x + (offsetX * factorDistancia), smoothing);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, controls.target.z + (offsetZ * factorDistancia), smoothing);
    }

    if (usarVistaInterior) {
      const alturaRelativaObjetivo = Math.max(cameraHeight - cameraTargetHeight, 1.05);
      if (offsetYActual > alturaRelativaObjetivo + 0.35 && distanciaHorizontalActual > cameraDistance + 0.04) {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, controls.target.y + alturaRelativaObjetivo, smoothing * 0.9);
      }
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
