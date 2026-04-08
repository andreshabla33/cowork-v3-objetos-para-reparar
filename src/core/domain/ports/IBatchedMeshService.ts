/**
 * @module core/domain/ports/IBatchedMeshService
 * @description Domain port for GPU-efficient batched rendering of static objects.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 * Infrastructure adapter (BatchedMeshThreeAdapter) provides the Three.js impl.
 *
 * Problem solved (Fase 3):
 *   Each static office object (desk, chair, wall) generates its own draw call.
 *   With 200+ objects in a workspace, this saturates the GPU command buffer.
 *   BatchedMesh collapses N objects with the same material into 1 draw call.
 *
 * Ref: Three.js r170 docs — BatchedMesh
 *   https://threejs.org/docs/pages/BatchedMesh.html
 *   BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, material)
 *   - r169: setGeometryIdAt, deleteInstance, getGeometryRangeAt
 *   - r170: deleteGeometry, optimize (repack), resize support
 *
 * Ref: R3F scaling docs — "Instancing"
 *   https://r3f.docs.pmnd.rs/advanced/scaling-performance#instancing
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Opaque reference to a geometry registered in the batch (avoids Three.js dep) */
export type BatchGeometryId = string;

/** Opaque reference to an instance in the batch */
export type BatchInstanceId = string;

/** 4x4 column-major transform matrix (Float32Array of 16 elements) */
export type Matrix4Flat = Float32Array;

/** Statistics for GPU monitoring */
export interface BatchedMeshStats {
  /** Number of registered geometry templates */
  geometryCount: number;
  /** Number of active instances in the batch */
  instanceCount: number;
  /** Approximate total vertex count across all registered geometries */
  totalVertices: number;
  /** Whether the batch needs optimize() to reclaim deleted geometry space */
  needsOptimize: boolean;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

export interface IBatchedMeshService {
  /**
   * Initialize the batched mesh with capacity limits.
   * Must be called before any addGeometry/addInstance calls.
   *
   * @param maxInstances  Maximum number of instances (draw entries)
   *                      (Three.js r170: first param `maxInstanceCount` of BatchedMesh constructor)
   * @param maxVertices   Maximum total vertex count (sum of all geometries)
   * @param maxIndices    Maximum total index count (sum of all geometries)
   */
  initialize(maxInstances: number, maxVertices: number, maxIndices: number): void;

  /**
   * Register a geometry template into the batch and return its ID.
   * The same geometry ID can be used to create multiple instances.
   *
   * @param key       Cache key (used to avoid duplicate registrations)
   * @param geometry  Opaque geometry reference (THREE.BufferGeometry at runtime)
   * @returns         Geometry ID for use in addInstance()
   */
  addGeometry(key: string, geometry: unknown): BatchGeometryId;

  /**
   * Get the geometry ID for an already-registered geometry key.
   * Returns null if the key is not registered.
   */
  getGeometryId(key: string): BatchGeometryId | null;

  /**
   * Create a new instance of a registered geometry.
   *
   * @param geometryId  ID returned by addGeometry()
   * @param matrix      Initial world transform (column-major Float32Array[16])
   * @returns           Instance ID for later updates/removal
   */
  addInstance(geometryId: BatchGeometryId, matrix: Matrix4Flat): BatchInstanceId;

  /**
   * Update the world transform of an existing instance.
   * Called every frame for animated objects (e.g., doors).
   */
  updateInstanceMatrix(instanceId: BatchInstanceId, matrix: Matrix4Flat): void;

  /**
   * Set the color of an instance. Used to apply per-object colors when
   * multiple colored objects share a single BatchedMesh material.
   *
   * @param instanceId  Instance ID returned by addInstance()
   * @param r  Red channel [0..1]
   * @param g  Green channel [0..1]
   * @param b  Blue channel [0..1]
   *
   * Ref: THREE.BatchedMesh.setColorAt() — r170
   */
  setInstanceColor(instanceId: BatchInstanceId, r: number, g: number, b: number): void;

  /**
   * Toggle visibility of an instance without removing it.
   * More efficient than removeInstance + addInstance for temporary hiding.
   */
  setInstanceVisible(instanceId: BatchInstanceId, visible: boolean): void;

  /**
   * Remove an instance from the batch.
   * Note: Leaves a "hole" in the batch — call optimize() periodically.
   */
  removeInstance(instanceId: BatchInstanceId): void;

  /**
   * Remove a geometry template and all its instances.
   * Requires r170+ (deleteGeometry API).
   */
  removeGeometry(geometryId: BatchGeometryId): void;

  /**
   * Repack the internal buffers to eliminate gaps left by deletions.
   * Call after bulk removals to reclaim GPU memory.
   * Ref: THREE.BatchedMesh.optimize() — r170
   */
  optimize(): void;

  /**
   * Get the underlying Three.js mesh for scene attachment.
   * Returns opaque unknown to keep domain free of Three.js dep.
   */
  getMesh(): unknown;

  /** Get statistics for monitoring dashboards */
  getStats(): BatchedMeshStats;

  /**
   * Dispose the batch and free all GPU resources.
   * Call on workspace 3D unmount.
   */
  dispose(): void;
}
