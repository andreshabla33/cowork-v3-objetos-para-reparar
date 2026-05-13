/**
 * @module space3d/world/batcher/materialHelpers
 *
 * Helpers THREE-puros para grouping y cloning de materiales que van a
 * `BatchedMesh`. Sin React, sin R3F.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/materials/Material
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 */
import * as THREE from 'three';

/**
 * Genera una clave estable para grouping de materiales.
 * Misma clave = mismo `BatchedMesh` = 1 draw call.
 *
 * CRITICAL OPTIMIZATION: materiales que solo difieren en color (sin texturas)
 * comparten el MISMO grupo. Los colores per-instance se aplican vía
 * DataTexture + onBeforeCompile (Fase 4D), reemplazando `setColorAt`.
 * Esto colapsa los 67 meshes color-only de Keyboard.glb en 1 draw call.
 *
 * Grouping strategy:
 *   - Textured materials: group by texture UUID
 *   - Color-only materials: group by shader type + transparency + side
 *   - Per-instance color+metalness+roughness: via DataTexture (Fase 4D)
 *
 * Refs:
 *   gkjohnson/batched-material-properties-demo
 *   https://github.com/mrdoob/three.js/releases/tag/r170 (gl_DrawID)
 */
export function getMaterialKey(material: THREE.Material): string {
  if (material instanceof THREE.MeshStandardMaterial) {
    const hasMap = !!material.map;
    const hasNormal = !!material.normalMap;
    const alpha = material.transparent ? 'T' : 'O';

    if (hasMap || hasNormal) {
      const mapId = material.map?.uuid ?? 'no-map';
      const normalId = material.normalMap?.uuid ?? 'no-normal';
      return `std_tex_${mapId}_${normalId}_${alpha}_${material.side}`;
    }
    return `std_color_${alpha}_${material.side}`;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    if (material.map) {
      return `basic_tex_${material.map.uuid}`;
    }
    return `basic_color_${material.transparent ? 'T' : 'O'}`;
  }
  return `mat_${material.uuid}`;
}

/** True si el material tiene texturas (afecta grouping por identidad). */
export function materialHasTextures(material: THREE.Material): boolean {
  if (material instanceof THREE.MeshStandardMaterial) {
    return !!(material.map || material.normalMap);
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return !!material.map;
  }
  return false;
}

/**
 * Clona un `THREE.Material` para uso en `BatchedMesh`.
 * Cada grupo recibe su propia instancia para evitar shared state.
 *
 * CRITICAL: para grupos color-only (sin texturas), la base color debe ser
 * white (0xffffff). El shader injection de Fase 4D (DataTexture) REEMPLAZA
 * `diffuseColor` en el fragment shader, pero el pipeline interno de Three.js
 * sigue corriendo `color_vertex.glsl`, que MULTIPLICA `vColor` con
 * `batchingColor`. Base blanca garantiza que no haya corrupción de color
 * antes de que nuestro override corra.
 *
 * Refs:
 *   Three.js r170 — color_vertex.glsl.js, color_fragment.glsl.js
 *   gkjohnson/batched-material-properties-demo
 */
export function cloneMaterialForBatch(
  material: THREE.Material,
  forColorGroup: boolean,
): THREE.Material {
  const cloned = material.clone();
  cloned.shadowSide = THREE.FrontSide;

  if (forColorGroup) {
    if (cloned instanceof THREE.MeshStandardMaterial) {
      cloned.color.set(0xffffff);
    } else if (cloned instanceof THREE.MeshBasicMaterial) {
      cloned.color.set(0xffffff);
    }
  }

  return cloned;
}
