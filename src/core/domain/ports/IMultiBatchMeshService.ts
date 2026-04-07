/**
 * @module core/domain/ports/IMultiBatchMeshService
 * @description Domain port for multi-material batched rendering.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 *
 * Problem solved (Fase 4A):
 *   Fase 3 used a SINGLE BatchedMesh with 1 shared material → textured objects
 *   rendered as solid color. Industry pattern (Mozilla Hubs, Roblox):
 *   create N BatchedMesh — one per material group — so each group keeps
 *   its own textures, transparency, roughness, etc.
 *
 * Ref: Three.js r170 — BatchedMesh (1 material per instance)
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 *   Issue #27930: Multi-material "not planned" — N BatchedMesh is the solution.
 *
 * Ref: Mozilla Hubs — three-batch-manager pattern
 *   https://github.com/Hubs-Foundation/three-batch-manager
 */

import type { BatchGeometryId, BatchInstanceId, Matrix4Flat, BatchedMeshStats } from './IBatchedMeshService';

// Re-export for convenience
export type { BatchGeometryId, BatchInstanceId, Matrix4Flat, BatchedMeshStats };

// ─── Types ────────────────────────────────────────────────────────────────────

/** Configuration for a material group (one BatchedMesh per group) */
export interface MaterialGroupConfig {
  /** Unique key identifying this material group (e.g., 'std_ff8800_no-map_no-normal_false_0') */
  materialKey: string;
  /** Opaque material reference (THREE.Material at runtime) */
  material: unknown;
  /** Max instances for this group */
  maxInstances: number;
  /** Max total vertices */
  maxVertices: number;
  /** Max total indices */
  maxIndices: number;
}

/** Compound instance ID: materialKey + instanceId */
export interface MultiBatchInstanceRef {
  materialKey: string;
  instanceId: BatchInstanceId;
}

/** Aggregate stats across all groups */
export interface MultiBatchStats {
  /** Number of material groups (= number of draw calls) */
  groupCount: number;
  /** Total instances across all groups */
  totalInstances: number;
  /** Total registered geometries across all groups */
  totalGeometries: number;
  /** Per-group stats */
  groups: Map<string, BatchedMeshStats>;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

export interface IMultiBatchMeshService {
  /**
   * Create a material group (one BatchedMesh).
   * Call once per unique material detected in the scene.
   */
  createGroup(config: MaterialGroupConfig): void;

  /** Check if a material group exists */
  hasGroup(materialKey: string): boolean;

  /**
   * Register a geometry in a specific material group.
   * @param materialKey  The material group to add to
   * @param geoKey       Cache key for the geometry
   * @param geometry     Opaque BufferGeometry reference
   */
  addGeometry(materialKey: string, geoKey: string, geometry: unknown): BatchGeometryId;

  /** Get geometry ID within a group */
  getGeometryId(materialKey: string, geoKey: string): BatchGeometryId | null;

  /**
   * Create an instance within a material group.
   * @returns Compound reference for later updates
   */
  addInstance(
    materialKey: string,
    geometryId: BatchGeometryId,
    matrix: Matrix4Flat,
  ): MultiBatchInstanceRef;

  /** Update instance transform */
  updateInstanceMatrix(ref: MultiBatchInstanceRef, matrix: Matrix4Flat): void;

  /** Set per-instance color override */
  setInstanceColor(ref: MultiBatchInstanceRef, r: number, g: number, b: number): void;

  /**
   * Toggle per-instance visibility (Fase 4C — frustum culling + LOD).
   * Uses BatchedMesh.setVisibleAt() internally.
   * Ref: Three.js r170 — setVisibleAt(instanceId, boolean)
   */
  setInstanceVisible(ref: MultiBatchInstanceRef, visible: boolean): void;

  /** Remove an instance */
  removeInstance(ref: MultiBatchInstanceRef): void;

  /** Get all underlying meshes for scene attachment */
  getAllMeshes(): unknown[];

  /** Get aggregate stats */
  getStats(): MultiBatchStats;

  /** Optimize all groups (repack after deletions) */
  optimizeAll(): void;

  /** Dispose all groups and free GPU resources */
  dispose(): void;
}
