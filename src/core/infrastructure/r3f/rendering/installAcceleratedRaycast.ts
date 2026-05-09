/**
 * @module lib/rendering/installAcceleratedRaycast
 *
 * Instala globalmente el sistema BVH de `three-mesh-bvh` sobre las
 * prototypes de `Mesh` y `BufferGeometry`. Se ejecuta una sola vez al
 * arranque de la app — antes de cualquier import de R3F.
 *
 * Efecto:
 *  - `Mesh.prototype.raycast` → `acceleratedRaycast` (BVH-aware)
 *  - `BufferGeometry.prototype.computeBoundsTree` / `disposeBoundsTree`
 *
 * Coste: nulo si ningún mesh llama a `computeBoundsTree()`. Para activar
 * BVH en una geometry específica, su dueño llama `geometry.computeBoundsTree()`
 * tras crearla. R3F (event system) usa el raycast acelerado automáticamente.
 *
 * Beneficio: documentado por three-mesh-bvh — "raycasting against 80,000+
 * polygons at 60 fps". Crítico para hardware bajo donde el raycast cada
 * frame de R3F (onPointer events) puede bloquear renders.
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md (Fase B.1 — performance low-end).
 *
 * Ref: https://github.com/gkjohnson/three-mesh-bvh#using-as-three-js-plugin
 */

import { Mesh, BufferGeometry } from 'three';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

let alreadyInstalled = false;

export function installAcceleratedRaycast(): void {
  if (alreadyInstalled) return;
  alreadyInstalled = true;

  // Override Mesh.raycast — todos los meshes ahora son BVH-aware.
  // Si la geometry no tiene BVH, hace fallback al raycast estándar.
  (Mesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
    acceleratedRaycast;

  // Métodos opcionales para que cualquier owner de geometry pueda activar BVH.
  (BufferGeometry.prototype as unknown as {
    computeBoundsTree: typeof computeBoundsTree;
  }).computeBoundsTree = computeBoundsTree;

  (BufferGeometry.prototype as unknown as {
    disposeBoundsTree: typeof disposeBoundsTree;
  }).disposeBoundsTree = disposeBoundsTree;
}
