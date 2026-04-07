/**
 * @module core/infrastructure/adapters/BatchedMeshThreeAdapter
 * @description Infrastructure adapter: Three.js r170 BatchedMesh implementation.
 *
 * Clean Architecture: Infrastructure layer — implements IBatchedMeshService.
 * This is the ONLY file in the project that imports THREE.BatchedMesh.
 *
 * Problem solved (Fase 3):
 *   200+ static objects each generating its own draw call saturates the
 *   GPU command buffer. BatchedMesh collapses N objects sharing the same
 *   material into 1 draw call.
 *
 * API notes (r170):
 *   - BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, material)
 *   - r169: setGeometryIdAt, deleteInstance, getGeometryRangeAt
 *   - r170: deleteGeometry, optimize() (repack after deletions)
 *   - Instance IDs and geometry IDs are raw integers from Three.js API;
 *     we wrap them as strings to match the opaque BatchGeometryId / BatchInstanceId types.
 *
 * Ref: Three.js r170 — BatchedMesh
 *   https://threejs.org/docs/pages/BatchedMesh.html
 *
 * Ref: R3F scaling docs — "Instancing"
 *   https://r3f.docs.pmnd.rs/advanced/scaling-performance#instancing
 */

import * as THREE from 'three';
import type {
  IBatchedMeshService,
  BatchGeometryId,
  BatchInstanceId,
  Matrix4Flat,
  BatchedMeshStats,
} from '../../domain/ports/IBatchedMeshService';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** THREE.BatchedMesh returns integer IDs; we stringify them for type safety. */
function toIntId(id: string): number {
  return parseInt(id, 10);
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class BatchedMeshThreeAdapter implements IBatchedMeshService {
  private _batch: THREE.BatchedMesh | null = null;

  /** key → stringified geometry ID */
  private readonly _geometryKeys = new Map<string, string>();

  /** instanceId → geometryId (for removeInstance bookkeeping) */
  private readonly _instanceToGeometry = new Map<string, string>();

  /** geometryId → Set<instanceId> (for removeGeometry cascades) */
  private readonly _geometryToInstances = new Map<string, Set<string>>();

  /** Running totals for stats (Three.js r170 does not expose vertex counts) */
  private _totalVertices = 0;
  private _needsOptimize = false;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  initialize(maxInstances: number, maxVertices: number, maxIndices: number): void {
    if (this._batch) {
      (this._batch.material as THREE.Material)?.dispose();
      this._batch.dispose();
    }
    // Base material — per-instance colors are applied via setColorAt().
    // vertexColors must be true for setColorAt to take effect.
    const material = new THREE.MeshStandardMaterial({ vertexColors: false });
    // r170 constructor: BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, material)
    // NOTE: First param is maxInstanceCount (NOT maxGeometryCount).
    // Ref: https://github.com/mrdoob/three.js/blob/r170/src/objects/BatchedMesh.js
    this._batch = new THREE.BatchedMesh(maxInstances, maxVertices, maxIndices, material);
    this._geometryKeys.clear();
    this._instanceToGeometry.clear();
    this._geometryToInstances.clear();
    this._totalVertices = 0;
    this._needsOptimize = false;
  }

  dispose(): void {
    if (this._batch) {
      // Dispose material explicitly — BatchedMesh.dispose() only frees geometry buffers.
      // Ref: https://threejs.org/manual/en/how-to-dispose-of-objects.html
      (this._batch.material as THREE.Material)?.dispose();
      this._batch.dispose();
    }
    this._batch = null;
    this._geometryKeys.clear();
    this._instanceToGeometry.clear();
    this._geometryToInstances.clear();
    this._totalVertices = 0;
    this._needsOptimize = false;
  }

  // ─── Geometry management ────────────────────────────────────────────────────

  addGeometry(key: string, geometry: unknown): BatchGeometryId {
    if (!this._batch) throw new Error('BatchedMeshThreeAdapter: call initialize() first');

    const existing = this._geometryKeys.get(key);
    if (existing !== undefined) return existing;

    const geo = geometry as THREE.BufferGeometry;
    const rawId = this._batch.addGeometry(geo);
    const id = rawId.toString();

    this._geometryKeys.set(key, id);
    this._geometryToInstances.set(id, new Set());

    // Track approximate vertex count for stats
    const posAttr = geo.attributes['position'];
    if (posAttr) this._totalVertices += posAttr.count;

    return id;
  }

  getGeometryId(key: string): BatchGeometryId | null {
    return this._geometryKeys.get(key) ?? null;
  }

  removeGeometry(geometryId: BatchGeometryId): void {
    if (!this._batch) return;

    // r170 API: deleteGeometry automatically removes all instances referencing
    // this geometry as a side effect (Three.js docs). No manual deleteInstance needed.
    this._batch.deleteGeometry(toIntId(geometryId));

    // Clean up internal bookkeeping maps
    const instances = this._geometryToInstances.get(geometryId);
    if (instances) {
      for (const instanceId of instances) {
        this._instanceToGeometry.delete(instanceId);
      }
      this._geometryToInstances.delete(geometryId);
    }

    // Remove key mapping
    for (const [key, id] of this._geometryKeys.entries()) {
      if (id === geometryId) {
        this._geometryKeys.delete(key);
        break;
      }
    }

    this._needsOptimize = true;
  }

  // ─── Instance management ────────────────────────────────────────────────────

  addInstance(geometryId: BatchGeometryId, matrix: Matrix4Flat): BatchInstanceId {
    if (!this._batch) throw new Error('BatchedMeshThreeAdapter: call initialize() first');

    const mat4 = new THREE.Matrix4();
    mat4.fromArray(matrix);

    const rawInstanceId = this._batch.addInstance(toIntId(geometryId));
    this._batch.setMatrixAt(rawInstanceId, mat4);

    const instanceId = rawInstanceId.toString();
    this._instanceToGeometry.set(instanceId, geometryId);
    this._geometryToInstances.get(geometryId)?.add(instanceId);

    return instanceId;
  }

  updateInstanceMatrix(instanceId: BatchInstanceId, matrix: Matrix4Flat): void {
    if (!this._batch) return;
    const mat4 = new THREE.Matrix4();
    mat4.fromArray(matrix);
    this._batch.setMatrixAt(toIntId(instanceId), mat4);
  }

  setInstanceColor(instanceId: BatchInstanceId, r: number, g: number, b: number): void {
    if (!this._batch) return;
    const color = new THREE.Color(r, g, b);
    this._batch.setColorAt(toIntId(instanceId), color);
  }

  setInstanceVisible(instanceId: BatchInstanceId, visible: boolean): void {
    if (!this._batch) return;
    this._batch.setVisibleAt(toIntId(instanceId), visible);
  }

  removeInstance(instanceId: BatchInstanceId): void {
    if (!this._batch) return;
    this._batch.deleteInstance(toIntId(instanceId));

    const geoId = this._instanceToGeometry.get(instanceId);
    if (geoId) {
      this._geometryToInstances.get(geoId)?.delete(instanceId);
      this._instanceToGeometry.delete(instanceId);
    }

    this._needsOptimize = true;
  }

  // ─── Optimization ───────────────────────────────────────────────────────────

  optimize(): void {
    if (!this._batch) return;
    this._batch.optimize();
    this._needsOptimize = false;
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  getMesh(): unknown {
    return this._batch;
  }

  getStats(): BatchedMeshStats {
    return {
      geometryCount: this._geometryKeys.size,
      instanceCount: this._instanceToGeometry.size,
      totalVertices: this._totalVertices,
      needsOptimize: this._needsOptimize,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: BatchedMeshThreeAdapter | null = null;

export function getBatchedMeshAdapter(): BatchedMeshThreeAdapter {
  if (!_instance) {
    _instance = new BatchedMeshThreeAdapter();
  }
  return _instance;
}

export function resetBatchedMeshAdapter(): void {
  _instance?.dispose();
  _instance = null;
}
