/**
 * @module core/infrastructure/adapters/MultiBatchMeshThreeAdapter
 * @description Infrastructure adapter: manages N Three.js BatchedMesh instances,
 * one per material group.
 *
 * Clean Architecture: Infrastructure layer — implements IMultiBatchMeshService.
 * Internally creates a BatchedMeshThreeAdapter per material group, each with
 * its own Three.js Material (preserving textures, transparency, etc.).
 *
 * Problem solved (Fase 4A):
 *   Fase 3 had 1 BatchedMesh with 1 MeshStandardMaterial → everything same color.
 *   Industry pattern (Mozilla Hubs): N BatchedMesh = N draw calls (one per material).
 *   With 500+ objects and ~10 unique materials → ~10 draw calls total.
 *
 * Ref: Three.js r170 — BatchedMesh
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 *   Issue #27930: Multi-material "not planned" → N BatchedMesh is official workaround.
 *
 * Ref: Mozilla Hubs — three-batch-manager pattern
 *   https://github.com/Hubs-Foundation/three-batch-manager
 */

import * as THREE from 'three';
import type {
  IMultiBatchMeshService,
  MaterialGroupConfig,
  MultiBatchInstanceRef,
  MultiBatchStats,
  BatchGeometryId,
  Matrix4Flat,
  BatchedMeshStats,
} from '../../domain/ports/IMultiBatchMeshService';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toIntId(id: string): number {
  return parseInt(id, 10);
}

// ─── Per-group batch wrapper ─────────────────────────────────────────────────

class MaterialGroupBatch {
  readonly mesh: THREE.BatchedMesh;
  private readonly _geometryKeys = new Map<string, string>();
  private readonly _instanceToGeometry = new Map<string, string>();
  private readonly _geometryToInstances = new Map<string, Set<string>>();
  private _totalVertices = 0;
  private _needsOptimize = false;

  constructor(
    maxInstances: number,
    maxVertices: number,
    maxIndices: number,
    material: THREE.Material,
  ) {
    // r170: BatchedMesh(maxInstanceCount, maxVertexCount, maxIndexCount, material)
    this.mesh = new THREE.BatchedMesh(maxInstances, maxVertices, maxIndices, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
  }

  addGeometry(key: string, geometry: THREE.BufferGeometry): string {
    const existing = this._geometryKeys.get(key);
    if (existing !== undefined) return existing;

    const rawId = this.mesh.addGeometry(geometry);
    const id = rawId.toString();
    this._geometryKeys.set(key, id);
    this._geometryToInstances.set(id, new Set());

    const posAttr = geometry.attributes['position'];
    if (posAttr) this._totalVertices += posAttr.count;

    return id;
  }

  getGeometryId(key: string): string | null {
    return this._geometryKeys.get(key) ?? null;
  }

  addInstance(geometryId: string, matrix: Float32Array): string {
    const mat4 = new THREE.Matrix4();
    mat4.fromArray(matrix);

    const rawId = this.mesh.addInstance(toIntId(geometryId));
    this.mesh.setMatrixAt(rawId, mat4);

    const instanceId = rawId.toString();
    this._instanceToGeometry.set(instanceId, geometryId);
    this._geometryToInstances.get(geometryId)?.add(instanceId);

    return instanceId;
  }

  setColor(instanceId: string, r: number, g: number, b: number): void {
    const color = new THREE.Color(r, g, b);
    this.mesh.setColorAt(toIntId(instanceId), color);
  }

  setVisible(instanceId: string, visible: boolean): void {
    this.mesh.setVisibleAt(toIntId(instanceId), visible);
  }

  updateMatrix(instanceId: string, matrix: Float32Array): void {
    const mat4 = new THREE.Matrix4();
    mat4.fromArray(matrix);
    this.mesh.setMatrixAt(toIntId(instanceId), mat4);
  }

  removeInstance(instanceId: string): void {
    this.mesh.deleteInstance(toIntId(instanceId));
    const geoId = this._instanceToGeometry.get(instanceId);
    if (geoId) {
      this._geometryToInstances.get(geoId)?.delete(instanceId);
      this._instanceToGeometry.delete(instanceId);
    }
    this._needsOptimize = true;
  }

  optimize(): void {
    this.mesh.optimize();
    this._needsOptimize = false;
  }

  getStats(): BatchedMeshStats {
    return {
      geometryCount: this._geometryKeys.size,
      instanceCount: this._instanceToGeometry.size,
      totalVertices: this._totalVertices,
      needsOptimize: this._needsOptimize,
    };
  }

  /** Get all instance IDs for frustum culling iteration */
  getAllInstanceIds(): string[] {
    return Array.from(this._instanceToGeometry.keys());
  }

  dispose(): void {
    (this.mesh.material as THREE.Material)?.dispose();
    this.mesh.dispose();
    this._geometryKeys.clear();
    this._instanceToGeometry.clear();
    this._geometryToInstances.clear();
  }
}

// ─── Main adapter ────────────────────────────────────────────────────────────

export class MultiBatchMeshThreeAdapter implements IMultiBatchMeshService {
  private readonly _groups = new Map<string, MaterialGroupBatch>();

  // ─── Group lifecycle ──────────────────────────────────────────────────────

  createGroup(config: MaterialGroupConfig): void {
    if (this._groups.has(config.materialKey)) return;

    const material = config.material as THREE.Material;
    const group = new MaterialGroupBatch(
      config.maxInstances,
      config.maxVertices,
      config.maxIndices,
      material,
    );
    this._groups.set(config.materialKey, group);
  }

  hasGroup(materialKey: string): boolean {
    return this._groups.has(materialKey);
  }

  // ─── Geometry management ──────────────────────────────────────────────────

  addGeometry(materialKey: string, geoKey: string, geometry: unknown): BatchGeometryId {
    const group = this._groups.get(materialKey);
    if (!group) throw new Error(`MultiBatch: group '${materialKey}' not found. Call createGroup() first.`);
    return group.addGeometry(geoKey, geometry as THREE.BufferGeometry);
  }

  getGeometryId(materialKey: string, geoKey: string): BatchGeometryId | null {
    return this._groups.get(materialKey)?.getGeometryId(geoKey) ?? null;
  }

  // ─── Instance management ──────────────────────────────────────────────────

  addInstance(
    materialKey: string,
    geometryId: BatchGeometryId,
    matrix: Matrix4Flat,
  ): MultiBatchInstanceRef {
    const group = this._groups.get(materialKey);
    if (!group) throw new Error(`MultiBatch: group '${materialKey}' not found.`);

    const instanceId = group.addInstance(geometryId, matrix);
    return { materialKey, instanceId };
  }

  updateInstanceMatrix(ref: MultiBatchInstanceRef, matrix: Matrix4Flat): void {
    this._groups.get(ref.materialKey)?.updateMatrix(ref.instanceId, matrix);
  }

  setInstanceColor(ref: MultiBatchInstanceRef, r: number, g: number, b: number): void {
    this._groups.get(ref.materialKey)?.setColor(ref.instanceId, r, g, b);
  }

  setInstanceVisible(ref: MultiBatchInstanceRef, visible: boolean): void {
    this._groups.get(ref.materialKey)?.setVisible(ref.instanceId, visible);
  }

  removeInstance(ref: MultiBatchInstanceRef): void {
    this._groups.get(ref.materialKey)?.removeInstance(ref.instanceId);
  }

  // ─── Scene integration ────────────────────────────────────────────────────

  getAllMeshes(): unknown[] {
    const meshes: THREE.BatchedMesh[] = [];
    for (const group of this._groups.values()) {
      meshes.push(group.mesh);
    }
    return meshes;
  }

  // ─── Optimization ─────────────────────────────────────────────────────────

  optimizeAll(): void {
    for (const group of this._groups.values()) {
      group.optimize();
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats(): MultiBatchStats {
    let totalInstances = 0;
    let totalGeometries = 0;
    const groups = new Map<string, BatchedMeshStats>();

    for (const [key, group] of this._groups.entries()) {
      const stats = group.getStats();
      groups.set(key, stats);
      totalInstances += stats.instanceCount;
      totalGeometries += stats.geometryCount;
    }

    return {
      groupCount: this._groups.size,
      totalInstances,
      totalGeometries,
      groups,
    };
  }

  // ─── Disposal ─────────────────────────────────────────────────────────────

  dispose(): void {
    for (const group of this._groups.values()) {
      group.dispose();
    }
    this._groups.clear();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: MultiBatchMeshThreeAdapter | null = null;

export function getMultiBatchMeshAdapter(): MultiBatchMeshThreeAdapter {
  if (!_instance) {
    _instance = new MultiBatchMeshThreeAdapter();
  }
  return _instance;
}

export function resetMultiBatchMeshAdapter(): void {
  _instance?.dispose();
  _instance = null;
}
