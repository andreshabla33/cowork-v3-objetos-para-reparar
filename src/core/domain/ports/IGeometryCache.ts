/**
 * @module core/domain/ports/IGeometryCache
 * @description Domain port for GPU geometry caching and lifecycle management.
 *
 * Clean Architecture: Domain layer — pure interface, no Three.js deps.
 * Infrastructure adapters (GeometryCacheAdapter) provide the Three.js impl.
 *
 * Problem solved:
 *   scene.clone(true) and inline JSX geometry creation duplicate BufferGeometry
 *   objects on GPU. With 1 avatar, renderer.info.memory.geometries = 1,479.
 *   Caching shared geometries reduces this to <400.
 *
 * Ref: Three.js docs — "Share materials and geometries if you can"
 *   https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
 *
 * Ref: R3F docs — "every geometry you create will be processed"
 *   https://r3f.docs.pmnd.rs/advanced/pitfalls
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Opaque type for geometry references (avoids Three.js dep in domain) */
export type GeometryRef = unknown;

/** Factory function to create a geometry when cache misses */
export type GeometryFactory = () => GeometryRef;

/** Cache statistics for monitoring */
export interface GeometryCacheStats {
  /** Total number of cached geometries */
  total: number;
  /** Cache keys for debugging */
  keys: string[];
}

// ─── Port Interface ─────────────────────────────────────────────────────────

export interface IGeometryCache {
  /**
   * Get a cached geometry by key, or create it using the factory.
   * Once cached, the same GPU buffer is reused by all meshes referencing it.
   *
   * @param key     Unique identifier (e.g., 'cylinder:0.3:0.3:0.8:8')
   * @param factory Function to create the geometry if not cached
   * @returns       Cached geometry reference
   */
  getOrCreate(key: string, factory: GeometryFactory): GeometryRef;

  /**
   * Check if a geometry reference is managed by this cache.
   * Used by dispose hooks to avoid disposing shared geometries.
   *
   * @param geometry  The geometry reference to check
   * @returns         true if the geometry is in the cache
   */
  has(geometry: GeometryRef): boolean;

  /**
   * Get cache statistics for monitoring via useRendererMetrics.
   */
  getStats(): GeometryCacheStats;

  /**
   * Dispose a single cached geometry and free its GPU buffer.
   *
   * @param key  The cache key to dispose
   */
  dispose(key: string): void;

  /**
   * Dispose ALL cached geometries and clear the cache.
   * Call on workspace 3D unmount to prevent GPU memory leaks.
   */
  disposeAll(): void;
}
