/**
 * @module infrastructure/r3f/rendering/sceneBreakdown
 *
 * Auditoría puntual de la escena: agrupa meshes por categoría para
 * identificar qué grupos contribuyen más draw calls cuando el monitor
 * detecta una alerta (`saludable=false`).
 *
 * Three.js r183 NO expone breakdown per-material en `renderer.info` — solo
 * el agregado total. Workaround estándar: scene.traverse + clasificación
 * por `material.name`, `mesh.name` y heurísticas.
 *
 * Output: JSON estructurado para logger. Diseñado para diagnóstico puntual
 * (no para hot path) — coste O(N meshes) en cada llamada.
 *
 * Ref: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
 */

import * as THREE from 'three';

export interface CategoriaMeshes {
  /** Cantidad de meshes en la categoría */
  meshes: number;
  /** Total de instancias (instancedMesh.count agregado) */
  instances: number;
  /** Triángulos estimados de la categoría */
  triangles: number;
  /** Estimado de draw calls (1 por mesh visible, sumando InstancedMesh como 1) */
  estDrawCalls: number;
}

export type SceneBreakdown = Record<string, CategoriaMeshes>;

/**
 * Detecta la categoría de un mesh según su `material.name`, `mesh.name`,
 * y heurísticas de tipo. Las prioridades reflejan el orden de detección
 * en Cowork v3.7:
 *   1. material.name con prefijo conocido (`floor:`, `wall-`, etc.)
 *   2. mesh.userData.batchCategory si está seteado
 *   3. mesh.name patterns
 *   4. fallback por tipo (SkinnedMesh → avatar, InstancedMesh → instanced)
 */
function detectarCategoria(mesh: THREE.Mesh): string {
  // Por material.name (los adapters setean este campo)
  const materialName = Array.isArray(mesh.material)
    ? mesh.material[0]?.name
    : mesh.material?.name;

  if (materialName) {
    if (materialName.startsWith('floor:')) return 'floor';
    if (materialName.startsWith('wall-')) return 'wall';
    if (materialName.startsWith('gltf-')) return 'gltf-batched';
  }

  // Por userData.batchCategory (si los adapters lo marcan)
  const userCat = mesh.userData?.batchCategory;
  if (typeof userCat === 'string') return userCat;

  // Por mesh.name patterns
  const name = mesh.name?.toLowerCase() ?? '';
  if (name.includes('avatar')) return 'avatar';
  if (name.includes('sky') || name.includes('dome')) return 'sky-dome';
  if (name.includes('terrain') || name.includes('ground')) return 'terrain';
  if (name.includes('label') || name.includes('text')) return 'text-label';
  if (name.includes('helper') || name.includes('grid')) return 'helper';
  if (name.includes('logo')) return 'logo-plane';

  // Por tipo
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return 'skinned-avatar';
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) return 'instanced-other';
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) return 'batched-other';

  return 'uncategorized';
}

function contarTriangulos(geometry: THREE.BufferGeometry, instances: number): number {
  const indexCount = geometry.index?.count ?? 0;
  const posCount = geometry.attributes.position?.count ?? 0;
  const verts = indexCount > 0 ? indexCount : posCount;
  return Math.floor((verts / 3) * Math.max(1, instances));
}

/**
 * Recorre la escena (excluyendo invisibles) y agrupa meshes por categoría.
 * Llamar bajo demanda — NO en hot path.
 */
export function categorizarMeshesEnEscena(scene: THREE.Object3D): SceneBreakdown {
  const breakdown: SceneBreakdown = {};

  scene.traverse((obj) => {
    if (!obj.visible) return;
    if (!(obj as THREE.Mesh).isMesh) return;

    const mesh = obj as THREE.Mesh;
    const cat = detectarCategoria(mesh);
    const entry = breakdown[cat] ?? {
      meshes: 0,
      instances: 0,
      triangles: 0,
      estDrawCalls: 0,
    };

    const instancedMesh = mesh as THREE.InstancedMesh;
    const batchedMesh = mesh as THREE.BatchedMesh;

    const instances = instancedMesh.isInstancedMesh
      ? instancedMesh.count
      : batchedMesh.isBatchedMesh
        ? batchedMesh.instanceCount ?? 1
        : 1;

    entry.meshes += 1;
    entry.instances += instances;
    entry.triangles += contarTriangulos(mesh.geometry, instances);
    // 1 draw call por mesh visible: instanced + batched colapsan en 1.
    entry.estDrawCalls += 1;

    breakdown[cat] = entry;
  });

  return breakdown;
}

/**
 * Devuelve un resumen ordenado por estDrawCalls descendente, útil para logs.
 */
export function resumirBreakdownParaLog(breakdown: SceneBreakdown): Array<{
  categoria: string;
  meshes: number;
  instances: number;
  triangles: number;
  estDrawCalls: number;
}> {
  return Object.entries(breakdown)
    .map(([categoria, data]) => ({ categoria, ...data }))
    .sort((a, b) => b.estDrawCalls - a.estDrawCalls);
}
