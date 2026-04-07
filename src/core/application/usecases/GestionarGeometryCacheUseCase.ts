/**
 * @module core/application/usecases/GestionarGeometryCacheUseCase
 * @description Use case: Manage GPU geometry cache lifecycle.
 *
 * Clean Architecture: Application layer — orchestrates IGeometryCache port.
 * No Three.js dependencies — works with opaque GeometryRef type.
 *
 * Problem solved:
 *   renderer.info.memory.geometries = 1,479 with 1 avatar.
 *   This use case provides a domain-aware API for geometry caching,
 *   allowing rendering components to share geometries without
 *   duplicating GPU buffers.
 *
 * Ref: Three.js docs — "How to dispose of objects"
 *   https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
 */

import type {
  IGeometryCache,
  GeometryRef,
  GeometryFactory,
  GeometryCacheStats,
} from '../../domain/ports/IGeometryCache';

export class GestionarGeometryCacheUseCase {
  constructor(private readonly cache: IGeometryCache) {}

  /**
   * Get or create a cached geometry.
   * Components call this instead of `new THREE.BoxGeometry(...)`.
   */
  obtenerOCrear(key: string, factory: GeometryFactory): GeometryRef {
    return this.cache.getOrCreate(key, factory);
  }

  /**
   * Check if a geometry is managed by the cache.
   * Dispose hooks use this to avoid disposing shared geometries.
   */
  esCacheada(geometry: GeometryRef): boolean {
    return this.cache.has(geometry);
  }

  /**
   * Get cache stats for monitoring dashboards.
   */
  obtenerEstadisticas(): GeometryCacheStats {
    return this.cache.getStats();
  }

  /**
   * Dispose all cached geometries.
   * Call on workspace 3D scene unmount.
   */
  limpiarTodo(): void {
    this.cache.disposeAll();
  }
}
