/**
 * @module space3d/world/batcher/geometryHelpers
 *
 * Helpers de geometría para BatchedMesh:
 *   - `ensureConsistentAttributes`: garantiza position/normal/uv en cada
 *     geometría antes de meterla al mismo batch (r170 requiere attributes
 *     consistentes en todas las geometrías de un batch).
 *   - `limpiarGeometryNormCache`: drop del cache (dispose GPU + clear map).
 *   - `remapUVsForAtlas`: shift/scale de UVs para encajar en una región
 *     de TextureAtlas (Fase 4B).
 *
 * Pattern clone+dispose viven JUNTOS aquí porque la doc oficial three.js
 * advierte: cada `clone()` produce recursos GPU propios — el `dispose()`
 * debe seguir el lifecycle del clone. Separarlos en archivos distintos
 * arriesgaría leaks GPU.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/core/BufferGeometry.clone
 *   https://threejs.org/docs/#api/en/core/BufferGeometry.dispose
 */
import * as THREE from 'three';

/**
 * Cache de geometrías normalizadas por UUID original.
 *
 * Problema: `ensureConsistentAttributes()` clonaba cada geometría en cada
 * llamada, generando ~570 geometrías/segundo durante movimiento
 * (4 724 en 8 s de exploración). El "geometry churn" presiona el
 * GPU memory allocator.
 *
 * Solución: cache keyed por UUID. La primera vez se normaliza + se guarda
 * en cache como "plantilla"; cada consumer recibe un `.clone()` de la
 * plantilla.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/core/BufferGeometry (uuid property)
 *   Object pooling pattern — https://discoverthreejs.com/tips-and-tricks/
 */
const _geometryNormCache = new Map<string, THREE.BufferGeometry>();

/**
 * Asegura que la geometría tenga position, normal, y uv attributes.
 * Requerido por BatchedMesh r170 — todas las geometrías del mismo batch
 * deben tener el mismo set de attributes.
 *
 * Usa el cache de plantillas para evitar re-clonar.
 */
export function ensureConsistentAttributes(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const cached = _geometryNormCache.get(geometry.uuid);
  if (cached) return cached.clone();

  const normalized = geometry.clone();
  const vertexCount = normalized.getAttribute('position')?.count ?? 0;

  if (!normalized.getAttribute('normal')) {
    normalized.computeVertexNormals();
  }

  if (!normalized.getAttribute('uv')) {
    const uvArray = new Float32Array(vertexCount * 2);
    normalized.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  _geometryNormCache.set(geometry.uuid, normalized);

  return normalized.clone();
}

/**
 * Limpia el cache de geometrías normalizadas.
 * Llamar cuando se desmonte el batcher o cambien los objetos.
 */
export function limpiarGeometryNormCache(): void {
  for (const geo of _geometryNormCache.values()) {
    geo.dispose();
  }
  _geometryNormCache.clear();
}

/**
 * Remapea coordenadas UV de una geometría para encajar dentro de una región
 * del atlas. UVs originales [0,1] → [offsetX, offsetX + scaleX] etc.
 */
export function remapUVsForAtlas(
  geometry: THREE.BufferGeometry,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): void {
  const uvAttr = geometry.getAttribute('uv');
  if (!uvAttr) return;

  const uvArray = uvAttr.array as Float32Array;
  for (let i = 0; i < uvArray.length; i += 2) {
    const u = Math.max(0, Math.min(1, uvArray[i]));
    const v = Math.max(0, Math.min(1, uvArray[i + 1]));
    uvArray[i] = offsetX + u * scaleX;
    uvArray[i + 1] = offsetY + v * scaleY;
  }
  uvAttr.needsUpdate = true;
}
