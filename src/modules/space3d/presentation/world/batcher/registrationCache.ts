/**
 * @module space3d/world/batcher/registrationCache
 *
 * Cache module-level + reset coordinado para el `StaticObjectBatcher`.
 *
 * Mantiene:
 *   - `_registration` → última firma + services registrados.
 *   - `_registeredModels` → modeloUrl → firma, consultado por
 *     `BatchedGroupLoader` para fast-path cache-hit.
 *   - `_trackedInstances` → instancias para frustum culling.
 *
 * `resetRegistrationCache` orquesta el wipe atómico:
 *   1. detach BatchedMeshes del scene graph (Object3D.removeFromParent)
 *   2. dispose vía `multiBatch.limpiar()` + `materialProps.limpiar()` +
 *      `textureAtlas.limpiar()`
 *   3. limpia cache de geometrías normalizadas
 *   4. resetea registration state
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/core/Object3D.removeFromParent
 *   https://r3f.docs.pmnd.rs/api/objects#disposal
 */
import type * as THREE from 'three';
import type { SceneOptimizationServices } from '@/modules/space3d/presentation/hooks/useSceneOptimization';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import { limpiarGeometryNormCache } from './geometryHelpers';
import type { TrackedInstance } from './batcherTypes';

interface RegistrationState {
  signature: string | null;
  services: SceneOptimizationServices | null;
}

/**
 * P1 PERFORMANCE FIX (2026-04-10) — Módulo-level registration cache.
 *
 * Mientras la firma + services sean idénticos entre remounts, se omite
 * el trabajo pesado (merge + agregarGeometria + agregarInstancia). Si
 * la firma cambia, se ejecuta `limpiar()` y se re-registra.
 */
export const _registration: RegistrationState = {
  signature: null,
  services: null,
};

/** modeloUrl → firma de objetos ya registrada. */
export const _registeredModels = new Map<string, string>();

/** Tracked instances para frustum culling, compartido entre Loader y Culler. */
export const _trackedInstances: TrackedInstance[] = [];

/** Firma estable de un grupo de objetos. Solo depende de IDs ordenados. */
export function computeObjetosSignature(objetos: EspacioObjeto[]): string {
  return objetos
    .map((o) => o.id)
    .sort()
    .join(',');
}

/** Firma global de todos los grupos (detecta cambios de espacio). */
export function computeGruposSignature(grupos: Map<string, EspacioObjeto[]>): string {
  const parts: string[] = [];
  for (const [url, objs] of grupos) {
    parts.push(`${url}::${computeObjetosSignature(objs)}`);
  }
  return parts.sort().join('|');
}

/**
 * Full reset de todo el estado cacheado. Llamar SOLO cuando la firma cambia.
 *
 * CRITICAL (2026-05-13): detach BatchedMeshes del scene graph ANTES de
 * `dispose()`. Tres razones documentadas:
 *
 *   (1) three.js r182 `BatchedMesh.dispose()` setea `_matricesTexture = null`
 *       (BatchedMesh.js:1491). El `getMatrixAt()` interno lee
 *       `_matricesTexture.image.data` → null deref. Footgun no documentado.
 *
 *   (2) Aunque el rendering es declarativo (`<primitive>`), el detach del
 *       primitive ocurre en commit-phase asíncrono. Entre `limpiar()` (sync,
 *       render-phase) y commit-phase hay frames donde los meshes están
 *       disposed pero todavía attached al scene. El raycaster de cámara
 *       (CameraFollow.tsx) corre cada frame → null deref.
 *
 *   (3) `<primitive dispose={null}>` confirma que el lifecycle del mesh es
 *       responsabilidad nuestra; el detach manual sync es coherente.
 *
 * `removeFromParent()` (API estable r182) con `parent === null` es no-op
 * idempotente — seguro de llamar siempre.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/core/Object3D.removeFromParent
 *   https://r3f.docs.pmnd.rs/api/objects#disposal
 */
export function resetRegistrationCache(services: SceneOptimizationServices): void {
  if (services.isReady) {
    const meshes = services.multiBatch.obtenerTodosMeshes() as THREE.Object3D[];
    for (const mesh of meshes) {
      mesh.removeFromParent();
    }
    services.multiBatch.limpiar();
    services.materialProps.limpiar();
    services.textureAtlas.limpiar();
  }
  _trackedInstances.length = 0;
  limpiarGeometryNormCache();
  _registeredModels.clear();
  _registration.signature = null;
  _registration.services = null;
}
