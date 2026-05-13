/**
 * @module space3d/world/batcher/batcherTypes
 *
 * Tipos compartidos por `StaticObjectBatcher`, `BatchedGroupLoader` y
 * `FrustumCuller`. TypeScript-only — sin código runtime.
 */
import type * as THREE from 'three';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import type { SceneOptimizationServices } from '@/modules/space3d/presentation/hooks/useSceneOptimization';
import type { MultiBatchInstanceRef } from '@/src/core/domain/ports/IMultiBatchMeshService';

export interface StaticObjectBatcherProps {
  gruposPorModelo: Map<string, EspacioObjeto[]>;
  services: SceneOptimizationServices;
  playerPosition: { x: number; z: number };
  onInteractuar?: (objeto: EspacioObjeto) => void;
}

export interface BatchedGroupProps {
  modeloUrl: string;
  objetos: EspacioObjeto[];
  services: SceneOptimizationServices;
  /**
   * Notifica al padre que la lista interna de `BatchedMesh` cambió
   * (registro nuevo o cache-hit tras reset). El padre re-fetcha
   * `obtenerTodosMeshes()` y actualiza el state que renderiza los
   * `<primitive>` declarativos.
   */
  onMeshesChanged?: () => void;
}

/** Instancia trackeada para frustum culling + LOD. */
export interface TrackedInstance {
  ref: MultiBatchInstanceRef;
  worldPos: THREE.Vector3;
  vertexCount: number;
  objetoId: string;
}
