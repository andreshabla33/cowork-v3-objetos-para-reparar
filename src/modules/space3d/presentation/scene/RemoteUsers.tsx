'use client';
/**
 * @module space3d/scene/RemoteUsers
 *
 * Renderer ECS-driven de todos los avatares remotos. Agrupa por LOD
 * (full / mid-capsule / crowd-sphere) según `renderPolicy` y emite
 * `InstancedAvatarRenderer` por modelUrl único (1 draw call por modelo).
 * Las overlays per-avatar (video, chat, reaction, radial wheel) las renderiza
 * el componente `<Avatar>`. Etiquetas via `<AvatarLabels>` unificado.
 *
 * Extraído de `Avatar3DScene.tsx` (ITEM 15 P1-07).
 *
 * Clean Architecture — Presentation. Coordina los servicios ECS
 * (movement/culling/animation/runtime scheduler) que viven en Infrastructure.
 * Sin acceso directo a Supabase.
 */

import React, { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GhostAvatar } from '@/modules/space3d/presentation/world/GhostAvatar';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/core/infrastructure/r3f/ecs/espacioEcs';
import { getSettingsSection, subscribeToSettings } from '@/core/infrastructure/userSettings/userSettings';
import { DireccionAvatar } from './shared';
import { statusColors } from './spaceTypes';
import { avatarStore } from '@/core/infrastructure/r3f/ecs/AvatarECS';
import { movementSystem, cullingSystem, animationSystem } from '@/core/infrastructure/r3f/ecs/AvatarSystems';
import { crowdMarkerGeometry } from '@/modules/space3d/presentation/world/sharedGeometries';
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
import { Avatar, type AvatarProps } from './Avatar';
import { TeleportEffect } from './TeleportEffect';

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

RemoteUsers.displayName = 'RemoteUsers';
