/**
 * @module core/application/usecases/GestionarBatchedMeshUseCase
 * @description Use case: Manage GPU-efficient batched rendering lifecycle.
 *
 * Clean Architecture: Application layer — orchestrates IBatchedMeshService port.
 * No Three.js dependencies — works with opaque types (BatchGeometryId, BatchInstanceId).
 *
 * Problem solved (Fase 3):
 *   200+ static objects each generating its own draw call saturates the GPU
 *   command buffer. This use case exposes a domain-aware API for batched
 *   rendering, collapsing N same-material objects into 1 draw call.
 *
 * Ref: Three.js r170 — BatchedMesh API
 *   https://threejs.org/docs/pages/BatchedMesh.html
 */

import type {
  IBatchedMeshService,
  BatchGeometryId,
  BatchInstanceId,
  Matrix4Flat,
  BatchedMeshStats,
} from '../../domain/ports/IBatchedMeshService';

export class GestionarBatchedMeshUseCase {
  constructor(private readonly service: IBatchedMeshService) {}

  /**
   * Initialize the batch with capacity limits.
   * Call once before scene population.
   *
   * @param maxGeometrias Máximo de geometrías únicas (plantillas) — primer param de BatchedMesh r170
   * @param maxVertices   Vértices totales (suma de todas las geometrías)
   * @param maxIndices    Índices totales (suma de todas las geometrías)
   */
  inicializar(maxGeometrias: number, maxVertices: number, maxIndices: number): void {
    this.service.initialize(maxGeometrias, maxVertices, maxIndices);
  }

  /**
   * Register a geometry template (e.g., desk, chair, wall).
   * Returns an ID reusable for multiple instances.
   */
  agregarGeometria(clave: string, geometria: unknown): BatchGeometryId {
    return this.service.addGeometry(clave, geometria);
  }

  /**
   * Get the ID of an already-registered geometry.
   * Returns null if not found.
   */
  obtenerIdGeometria(clave: string): BatchGeometryId | null {
    return this.service.getGeometryId(clave);
  }

  /**
   * Create a new instance of a registered geometry at the given transform.
   */
  agregarInstancia(idGeometria: BatchGeometryId, matriz: Matrix4Flat): BatchInstanceId {
    return this.service.addInstance(idGeometria, matriz);
  }

  /**
   * Update the world transform of an existing instance (e.g., animated door).
   */
  actualizarMatrizInstancia(idInstancia: BatchInstanceId, matriz: Matrix4Flat): void {
    this.service.updateInstanceMatrix(idInstancia, matriz);
  }

  /**
   * Toggle instance visibility without removing it from the batch.
   * More efficient than remove + re-add for temporary hiding.
   */
  establecerVisibilidad(idInstancia: BatchInstanceId, visible: boolean): void {
    this.service.setInstanceVisible(idInstancia, visible);
  }

  /**
   * Remove an instance from the batch.
   * Leaves a hole — call compactarBatch() after bulk removals.
   */
  eliminarInstancia(idInstancia: BatchInstanceId): void {
    this.service.removeInstance(idInstancia);
  }

  /**
   * Remove a geometry template and all its instances (r170+ API).
   */
  eliminarGeometria(idGeometria: BatchGeometryId): void {
    this.service.removeGeometry(idGeometria);
  }

  /**
   * Repack internal buffers to eliminate gaps from deletions.
   * Call after bulk removals to reclaim GPU memory.
   */
  compactarBatch(): void {
    this.service.optimize();
  }

  /**
   * Get the underlying mesh for scene attachment.
   * Returns opaque reference (THREE.BatchedMesh at runtime).
   */
  obtenerMesh(): unknown {
    return this.service.getMesh();
  }

  /**
   * Get stats for monitoring dashboards.
   */
  obtenerEstadisticas(): BatchedMeshStats {
    return this.service.getStats();
  }

  /**
   * Dispose all GPU resources.
   * Call on workspace 3D unmount.
   */
  limpiar(): void {
    this.service.dispose();
  }
}
