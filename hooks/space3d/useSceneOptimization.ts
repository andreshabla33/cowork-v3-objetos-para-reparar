/**
 * @module hooks/space3d/useSceneOptimization
 * @description R3F hook bridge — connects Fase 3 GPU services (BatchedMesh,
 * TextureAtlas, GPUSkinnedInstance) to the React Three Fiber scene graph.
 *
 * Clean Architecture: Presentation layer hook — accesses Application layer
 * use cases via DI container. No direct Three.js imports (except types).
 *
 * Lifecycle:
 *   1. getDIContainer() on mount → lazy init of singletons
 *   2. Exposes use cases to child components/hooks
 *   3. Calls dispose on all services on unmount (workspace 3D teardown)
 *
 * Usage in R3F:
 *   const { batchedMesh, textureAtlas, gpuSkinning, isReady } = useSceneOptimization();
 *
 * Ref: R3F hooks — https://r3f.docs.pmnd.rs/api/hooks
 * Ref: Three.js r170 — BatchedMesh, DataTexture, CanvasTexture
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDIContainer, type DIContainer } from '@/src/core/infrastructure/di/container';
import { GestionarBatchedMeshUseCase } from '@/src/core/application/usecases/GestionarBatchedMeshUseCase';
import { GestionarTextureAtlasUseCase } from '@/src/core/application/usecases/GestionarTextureAtlasUseCase';
import { GestionarGPUSkinnedInstanceUseCase } from '@/src/core/application/usecases/GestionarGPUSkinnedInstanceUseCase';
import { logger } from '@/lib/logger';

const log = logger.child('scene-optimization');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneOptimizationServices {
  /** BatchedMesh use case — for static office objects */
  batchedMesh: GestionarBatchedMeshUseCase;
  /** TextureAtlas use case — for consolidating textures into one GPU bind */
  textureAtlas: GestionarTextureAtlasUseCase;
  /** GPU Skinned Instance use case — for 500 avatar bone matrices */
  gpuSkinning: GestionarGPUSkinnedInstanceUseCase;
  /** Whether all services are initialized and ready */
  isReady: boolean;
}

// ─── Default capacity constants ───────────────────────────────────────────────

/**
 * Max instances (draw entries) in the BatchedMesh.
 * This is the FIRST param of the BatchedMesh constructor (`maxInstanceCount`).
 * With ~200 objects × ~5 sub-meshes average = ~1000 instances needed.
 * Use 4096 for headroom.
 * Ref: https://github.com/mrdoob/three.js/blob/r170/src/objects/BatchedMesh.js
 */
const MAX_INSTANCES = 4096;
/** Max total vertices across all batched geometries */
const MAX_VERTICES = 500_000;
/** Max total indices across all batched geometries */
const MAX_INDICES = 1_000_000;
/** Max concurrent avatars for GPU skinned instancing */
const MAX_AVATARS = 512;
/** Bones per avatar skeleton (standard humanoid rig) */
const BONES_PER_AVATAR = 65;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSceneOptimization(): SceneOptimizationServices {
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<DIContainer | null>(null);

  // Create use cases lazily — they wrap the singleton adapters from DI
  const useCases = useMemo(() => {
    // Placeholder until DI resolves — will be replaced in useEffect
    return {
      batchedMesh: null as GestionarBatchedMeshUseCase | null,
      textureAtlas: null as GestionarTextureAtlasUseCase | null,
      gpuSkinning: null as GestionarGPUSkinnedInstanceUseCase | null,
    };
  }, []);

  // Stable refs for the use cases (avoids re-render on init)
  const batchedMeshRef = useRef<GestionarBatchedMeshUseCase | null>(null);
  const textureAtlasRef = useRef<GestionarTextureAtlasUseCase | null>(null);
  const gpuSkinningRef = useRef<GestionarGPUSkinnedInstanceUseCase | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const container = await getDIContainer();
        if (cancelled) return;

        containerRef.current = container;

        // Wrap DI services in use cases
        const bm = new GestionarBatchedMeshUseCase(container.batchedMesh);
        const ta = new GestionarTextureAtlasUseCase(container.textureAtlas);
        const gs = new GestionarGPUSkinnedInstanceUseCase(container.gpuSkinnedInstance);

        // Initialize with default capacities
        bm.inicializar(MAX_INSTANCES, MAX_VERTICES, MAX_INDICES);
        gs.inicializar(MAX_AVATARS, BONES_PER_AVATAR);

        batchedMeshRef.current = bm;
        textureAtlasRef.current = ta;
        gpuSkinningRef.current = gs;

        // Update the mutable useCases object (avoids extra re-render)
        useCases.batchedMesh = bm;
        useCases.textureAtlas = ta;
        useCases.gpuSkinning = gs;

        setIsReady(true);

        log.info('Scene optimization services initialized', {
          maxInstances: MAX_INSTANCES,
          maxVertices: MAX_VERTICES,
          maxAvatars: MAX_AVATARS,
          bonesPerAvatar: BONES_PER_AVATAR,
        });
      } catch (err) {
        log.error('Failed to initialize scene optimization', err as Record<string, unknown>);
      }
    })();

    return () => {
      cancelled = true;

      // Dispose all GPU resources on unmount
      batchedMeshRef.current?.limpiar();
      textureAtlasRef.current?.limpiar();
      gpuSkinningRef.current?.limpiar();

      batchedMeshRef.current = null;
      textureAtlasRef.current = null;
      gpuSkinningRef.current = null;

      log.info('Scene optimization services disposed');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Return stable object — use cases are accessed via refs that persist across renders
  return useMemo(
    () => ({
      get batchedMesh() { return batchedMeshRef.current!; },
      get textureAtlas() { return textureAtlasRef.current!; },
      get gpuSkinning() { return gpuSkinningRef.current!; },
      isReady,
    }),
    [isReady],
  );
}
