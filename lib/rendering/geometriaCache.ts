/**
 * @module lib/rendering/geometriaCache
 *
 * Cache global de geometrías Three.js para eliminar la fluctuación
 * observada en los logs: geometries 312↔567 (GC pressure).
 *
 * Clean Architecture: capa de infraestructura (lib/rendering/).
 * Los use cases de dominio NO importan este módulo.
 *
 * Problema detectado (logs renderer-metrics):
 *   geometries: 312 → 327 → 567 → 329 (fluctuación activa)
 * Causa: geometrías creadas en cada render con new BoxGeometry(), etc.
 * Solución: compartir instancias via este cache global.
 *
 * Ref: Three.js docs — "Share materials and geometries if you can"
 * https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
 *
 * Ref: R3F docs — "every geometry you create will be processed"
 * https://r3f.docs.pmnd.rs/advanced/pitfalls
 *
 * USO:
 * @example
 * // En lugar de: new THREE.BoxGeometry(1, 1, 1)
 * import { obtenerGeometria } from '@/lib/rendering/geometriaCache';
 * const geo = obtenerGeometria('box:1:1:1');
 */

import * as THREE from 'three';

// ─── Tipos del cache ──────────────────────────────────────────────────────────

type GeometriaFactory = () => THREE.BufferGeometry;

// ─── Cache Singleton ──────────────────────────────────────────────────────────

const _cache = new Map<string, THREE.BufferGeometry>();

/**
 * Obtiene una geometría cacheada por clave.
 * Si no existe, la crea usando el factory proporcionado y la guarda.
 *
 * Las geometrías se comparten entre todos los meshes con la misma clave,
 * reduciendo el número de buffers subidos a GPU.
 */
export const obtenerGeometria = (
  clave: string,
  factory: GeometriaFactory,
): THREE.BufferGeometry => {
  if (_cache.has(clave)) {
    return _cache.get(clave)!;
  }
  const geo = factory();
  _cache.set(clave, geo);
  return geo;
};

// ─── Geometrías predefinidas (más usadas en el workspace) ────────────────────

/**
 * Plano unitario (1×1) para suelos y paneles.
 * Reutilizado en zonas, suelos PBR y overlays 2D.
 */
export const geoPlanoUnitario = (): THREE.BufferGeometry =>
  obtenerGeometria('plane:1:1', () => new THREE.PlaneGeometry(1, 1));

/**
 * Caja unitaria (1×1×1) para objetos builtin simples.
 */
export const geoCajaUnitaria = (): THREE.BufferGeometry =>
  obtenerGeometria('box:1:1:1', () => new THREE.BoxGeometry(1, 1, 1));

/**
 * Caja pequena para previews de objetos en modo construcción.
 */
export const geoPreviewObjeto = (): THREE.BufferGeometry =>
  obtenerGeometria('box:0.28:0.16:0.28', () => new THREE.BoxGeometry(0.28, 0.16, 0.28));

/**
 * Plano grande invisible para raycast (eventos de suelo).
 */
export const geoSueloRaycast = (): THREE.BufferGeometry =>
  obtenerGeometria('plane:1000:1000', () => new THREE.PlaneGeometry(1000, 1000));

/**
 * Plano configurable — cacheado por dimensiones.
 * Evita crear un nuevo PlaneGeometry por cada zona de empresa.
 *
 * @example
 * const geo = geoPlano(10, 5); // cachea 'plane:10:5'
 */
export const geoPlano = (ancho: number, alto: number): THREE.BufferGeometry => {
  const clave = `plane:${ancho}:${alto}`;
  return obtenerGeometria(clave, () => new THREE.PlaneGeometry(ancho, alto));
};

// ─── Gestión del ciclo de vida ────────────────────────────────────────────────

/**
 * Estadísticas del cache (útil para debugging en dev).
 */
export const obtenerEstadisticasCache = (): { total: number; claves: string[] } => ({
  total: _cache.size,
  claves: Array.from(_cache.keys()),
});

/**
 * Libera TODAS las geometrías cacheadas de GPU.
 * LLAMAR al desmontar el workspace 3D para evitar memory leaks.
 *
 * @warning No llamar mientras algún mesh siga referenciando las geometrías.
 */
export const limpiarCacheGeometrias = (): void => {
  for (const geo of _cache.values()) {
    geo.dispose();
  }
  _cache.clear();
};

/**
 * Libera una geometría específica del cache.
 * Útil para geometrías de tamaño variable que ya no se necesitan.
 */
export const liberarGeometria = (clave: string): void => {
  const geo = _cache.get(clave);
  if (geo) {
    geo.dispose();
    _cache.delete(clave);
  }
};
