/**
 * @module core/infrastructure/adapters/GeometryCacheAdapter
 * @description Infrastructure adapter: Three.js geometry cache implementation.
 *
 * Clean Architecture: Infrastructure layer — implements IGeometryCache.
 * Wraps the existing lib/rendering/geometriaCache.ts singleton with the
 * domain port interface, adding the `has()` method needed by dispose hooks.
 *
 * Problem solved:
 *   renderer.info.memory.geometries = 1,479 with 1 avatar.
 *   By sharing geometries across cloned avatars and procedural objects,
 *   this cache reduces GPU buffer duplication.
 *
 * Ref: Three.js docs — "Share materials and geometries if you can"
 *   https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
 */

import * as THREE from 'three';
import type {
  IGeometryCache,
  GeometryRef,
  GeometryFactory,
  GeometryCacheStats,
} from '../../domain/ports/IGeometryCache';

/**
 * Singleton Three.js geometry cache.
 *
 * Extends the original geometriaCache pattern with:
 * - `has(geometry)`: O(1) reverse lookup for dispose safety
 * - `registerGLTFGeometries()`: Batch-register geometries from loaded GLTF
 * - Domain port compliance (IGeometryCache)
 */
export class GeometryCacheAdapter implements IGeometryCache {
  private readonly _cache = new Map<string, THREE.BufferGeometry>();
  private readonly _reverseIndex = new Set<THREE.BufferGeometry>();

  getOrCreate(key: string, factory: GeometryFactory): GeometryRef {
    const existing = this._cache.get(key);
    if (existing) return existing;

    const geo = factory() as THREE.BufferGeometry;
    this._cache.set(key, geo);
    this._reverseIndex.add(geo);
    return geo;
  }

  has(geometry: GeometryRef): boolean {
    return this._reverseIndex.has(geometry as THREE.BufferGeometry);
  }

  getStats(): GeometryCacheStats {
    return {
      total: this._cache.size,
      keys: Array.from(this._cache.keys()),
    };
  }

  dispose(key: string): void {
    const geo = this._cache.get(key);
    if (geo) {
      geo.dispose();
      this._reverseIndex.delete(geo);
      this._cache.delete(key);
    }
  }

  disposeAll(): void {
    for (const geo of this._cache.values()) {
      geo.dispose();
    }
    this._reverseIndex.clear();
    this._cache.clear();
  }

  /**
   * Batch-register all geometries from a loaded GLTF scene.
   * Uses modelUrl + mesh name as cache key.
   * Subsequent clones can reuse these geometries instead of duplicating.
   *
   * @param modelUrl  URL of the GLTF model (used as key prefix)
   * @param scene     The loaded GLTF scene to extract geometries from
   */
  registerGLTFGeometries(modelUrl: string, scene: THREE.Group): void {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const key = `gltf:${modelUrl}:${mesh.name || mesh.uuid}`;
        if (!this._cache.has(key)) {
          this._cache.set(key, mesh.geometry);
          this._reverseIndex.add(mesh.geometry);
        }
      }
    });
  }
}

// ─── Singleton instance ─────────────────────────────────────────────────────

let _instance: GeometryCacheAdapter | null = null;

/**
 * Get the global GeometryCacheAdapter singleton.
 * Components use this to share a single cache across the entire 3D scene.
 */
export function getGeometryCacheAdapter(): GeometryCacheAdapter {
  if (!_instance) {
    _instance = new GeometryCacheAdapter();
  }
  return _instance;
}

/**
 * Reset the singleton (for testing or full scene remount).
 */
export function resetGeometryCacheAdapter(): void {
  _instance?.disposeAll();
  _instance = null;
}
