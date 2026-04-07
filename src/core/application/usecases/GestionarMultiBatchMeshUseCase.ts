/**
 * @module core/application/usecases/GestionarMultiBatchMeshUseCase
 * @description Use case: Manage N BatchedMesh instances grouped by material.
 *
 * Clean Architecture: Application layer — orchestrates IMultiBatchMeshService port.
 * No Three.js dependencies — works with opaque types.
 *
 * Problem solved (Fase 4A):
 *   Fase 3 used 1 BatchedMesh = 1 material → textured objects lost their textures.
 *   This use case creates N BatchedMesh (one per material group), preserving
 *   textures, transparency, and per-material properties.
 *
 * Ref: Three.js r170 — BatchedMesh
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 */

import type {
  IMultiBatchMeshService,
  MaterialGroupConfig,
  MultiBatchInstanceRef,
  MultiBatchStats,
  BatchGeometryId,
  Matrix4Flat,
} from '../../domain/ports/IMultiBatchMeshService';

export class GestionarMultiBatchMeshUseCase {
  constructor(private readonly service: IMultiBatchMeshService) {}

  /**
   * Create a material group (one BatchedMesh with its own material).
   * Call once per unique material detected during GLTF traversal.
   */
  crearGrupoMaterial(config: MaterialGroupConfig): void {
    this.service.createGroup(config);
  }

  /** Check if a material group already exists */
  tieneGrupo(claveMaterial: string): boolean {
    return this.service.hasGroup(claveMaterial);
  }

  /**
   * Register a geometry in a specific material group.
   */
  agregarGeometria(claveMaterial: string, claveGeo: string, geometria: unknown): BatchGeometryId {
    return this.service.addGeometry(claveMaterial, claveGeo, geometria);
  }

  /** Get geometry ID within a group */
  obtenerIdGeometria(claveMaterial: string, claveGeo: string): BatchGeometryId | null {
    return this.service.getGeometryId(claveMaterial, claveGeo);
  }

  /**
   * Create an instance in a material group at the given transform.
   */
  agregarInstancia(
    claveMaterial: string,
    idGeometria: BatchGeometryId,
    matriz: Matrix4Flat,
  ): MultiBatchInstanceRef {
    return this.service.addInstance(claveMaterial, idGeometria, matriz);
  }

  /** Update instance world transform */
  actualizarMatriz(ref: MultiBatchInstanceRef, matriz: Matrix4Flat): void {
    this.service.updateInstanceMatrix(ref, matriz);
  }

  /** Set per-instance color (override material base color) */
  establecerColor(ref: MultiBatchInstanceRef, r: number, g: number, b: number): void {
    this.service.setInstanceColor(ref, r, g, b);
  }

  /**
   * Toggle instance visibility (Fase 4C — frustum culling / LOD).
   * More efficient than remove+add for temporary hiding.
   */
  establecerVisibilidad(ref: MultiBatchInstanceRef, visible: boolean): void {
    this.service.setInstanceVisible(ref, visible);
  }

  /** Remove an instance from its material group */
  eliminarInstancia(ref: MultiBatchInstanceRef): void {
    this.service.removeInstance(ref);
  }

  /** Get all underlying meshes for R3F scene attachment via <primitive> */
  obtenerTodosMeshes(): unknown[] {
    return this.service.getAllMeshes();
  }

  /** Get aggregate stats across all material groups */
  obtenerEstadisticas(): MultiBatchStats {
    return this.service.getStats();
  }

  /** Optimize all groups (repack after bulk deletions) */
  optimizarTodos(): void {
    this.service.optimizeAll();
  }

  /** Dispose all GPU resources */
  limpiar(): void {
    this.service.dispose();
  }
}
