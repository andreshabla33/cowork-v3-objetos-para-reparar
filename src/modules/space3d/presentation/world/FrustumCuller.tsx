'use client';
/**
 * @module space3d/world/FrustumCuller
 *
 * Fase 4C — Per-instance frustum culling + LOD distance para los
 * `BatchedMesh` registrados en `MultiBatch`. Corre cada
 * `FRUSTUM_UPDATE_INTERVAL` ms (no cada frame) y usa `setVisibleAt()` para
 * ocultar instancias fuera del frustum o más allá del LOD distance.
 *
 * DEBT-003 (2026-04-10) — Idle-guard: cuando la escena está estable
 * (cámara quieta, avatar quieto, instancias inmutables) salta TODO el
 * pase — cero iteraciones, cero llamadas a `establecerVisibilidad()`.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh.setVisibleAt
 *   https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { SceneOptimizationServices } from '@/modules/space3d/presentation/hooks/useSceneOptimization';
import { logger } from '@/core/infrastructure/observability/logger';
import {
  FRUSTUM_UPDATE_INTERVAL,
  LOD_HIDE_DISTANCE,
  LOD_HIDE_VERTEX_THRESHOLD,
} from './batcher/batcherConstants';
import { _trackedInstances } from './batcher/registrationCache';

const log = logger.child('FrustumCuller');

export interface FrustumCullerProps {
  services: SceneOptimizationServices;
  playerPosition: { x: number; z: number };
}

export const FrustumCuller: React.FC<FrustumCullerProps> = ({
  services,
  playerPosition,
}) => {
  const { camera } = useThree();
  const frustumRef = useRef(new THREE.Frustum());
  const projScreenMatrixRef = useRef(new THREE.Matrix4());
  const lastCullTimeRef = useRef(0);
  const _sphereTest = useMemo(() => new THREE.Sphere(), []);

  // Idle-guard refs — saltamos el pase si nada cambió.
  const lastCullMatrixRef = useRef(new THREE.Matrix4());
  const lastCullPlayerRef = useRef({ x: Number.NaN, z: Number.NaN });
  const lastCullInstanceCountRef = useRef(-1);

  useFrame(() => {
    if (!services.isReady || _trackedInstances.length === 0) return;

    const now = performance.now();
    if (now - lastCullTimeRef.current < FRUSTUM_UPDATE_INTERVAL) return;
    lastCullTimeRef.current = now;

    // Idle-guard: ref R3F pitfalls — "skip work when nothing changed".
    const cameraMoved = !camera.matrixWorld.equals(lastCullMatrixRef.current);
    const playerMoved =
      playerPosition.x !== lastCullPlayerRef.current.x ||
      playerPosition.z !== lastCullPlayerRef.current.z;
    const instancesChanged =
      _trackedInstances.length !== lastCullInstanceCountRef.current;

    if (!cameraMoved && !playerMoved && !instancesChanged) {
      return;
    }

    lastCullMatrixRef.current.copy(camera.matrixWorld);
    lastCullPlayerRef.current.x = playerPosition.x;
    lastCullPlayerRef.current.z = playerPosition.z;
    lastCullInstanceCountRef.current = _trackedInstances.length;

    projScreenMatrixRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustumRef.current.setFromProjectionMatrix(projScreenMatrixRef.current);

    const { multiBatch } = services;
    let visibleCount = 0;
    let culledCount = 0;

    for (const tracked of _trackedInstances) {
      _sphereTest.center.copy(tracked.worldPos);
      _sphereTest.radius = 2; // ~2m radius cubre la mayoría de muebles

      const inFrustum = frustumRef.current.intersectsSphere(_sphereTest);

      const dx = playerPosition.x - tracked.worldPos.x;
      const dz = playerPosition.z - tracked.worldPos.z;
      const distSq = dx * dx + dz * dz;
      const distThreshSq = LOD_HIDE_DISTANCE * LOD_HIDE_DISTANCE;
      const tooFarForDetail =
        tracked.vertexCount > LOD_HIDE_VERTEX_THRESHOLD && distSq > distThreshSq;

      const shouldBeVisible = inFrustum && !tooFarForDetail;

      try {
        multiBatch.establecerVisibilidad(tracked.ref, shouldBeVisible);
      } catch {
        // Instance may have been removed
      }

      if (shouldBeVisible) visibleCount++;
      else culledCount++;
    }

    // Log occasionally (every 5s)
    if (Math.floor(now / 5000) !== Math.floor((now - FRUSTUM_UPDATE_INTERVAL) / 5000)) {
      log.info('Frustum cull pass', {
        total: _trackedInstances.length,
        visible: visibleCount,
        culled: culledCount,
        cullRate: `${((culledCount / _trackedInstances.length) * 100).toFixed(0)}%`,
      });
    }
  });

  return null;
};

FrustumCuller.displayName = 'FrustumCuller';
