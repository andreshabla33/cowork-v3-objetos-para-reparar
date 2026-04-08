/**
 * @module core/application/usecases/GestionarPropiedadesMaterialBatchUseCase
 * @description Use case: Manage per-instance PBR material properties via DataTexture.
 *
 * Clean Architecture: Application layer — orchestrates IBatchMaterialPropertiesService.
 * No Three.js dependencies — works with opaque types.
 *
 * Multi-group design:
 *   Each material group (groupKey) gets its own DataTexture + shader injection.
 *   This aligns with MultiBatch architecture (1 BatchedMesh per material group).
 *
 * Problem solved (Fase 4D):
 *   Instead of N BatchedMesh groups for N different colors, pack color+metalness+roughness
 *   into a DataTexture and sample per-instance in the shader → 1 draw call for ALL
 *   color-only objects.
 *
 * Ref: gkjohnson/batched-material-properties-demo
 *   https://github.com/gkjohnson/batched-material-properties-demo
 * Ref: Three.js r170 — Material.onBeforeCompile + DataTexture
 */

import type {
  IBatchMaterialPropertiesService,
  InstanceMaterialProps,
  BatchMaterialPropsStats,
} from '../../domain/ports/IBatchMaterialPropertiesService';

export class GestionarPropiedadesMaterialBatchUseCase {
  constructor(private readonly service: IBatchMaterialPropertiesService) {}

  /**
   * Initialize a DataTexture for a material group.
   * Capacity should match the BatchedMesh maxInstances for this group.
   */
  inicializarGrupo(claveGrupo: string, maxInstancias: number): void {
    this.service.initializeGroup(claveGrupo, maxInstancias);
  }

  /** Check if a group exists */
  tieneGrupo(claveGrupo: string): boolean {
    return this.service.hasGroup(claveGrupo);
  }

  /**
   * Set PBR properties for a specific instance in a group.
   * Call sincronizarGPU() after all updates to upload to GPU.
   */
  establecerPropiedades(
    claveGrupo: string,
    indiceInstancia: number,
    props: InstanceMaterialProps,
  ): void {
    this.service.setInstanceProperties(claveGrupo, indiceInstancia, props);
  }

  /**
   * Batch-set properties for multiple instances (more efficient).
   */
  establecerPropiedadesMultiples(
    claveGrupo: string,
    entradas: Array<{ index: number; props: InstanceMaterialProps }>,
  ): void {
    this.service.setMultipleInstanceProperties(claveGrupo, entradas);
  }

  /**
   * Upload pending changes to GPU for a specific group.
   */
  sincronizarGrupoGPU(claveGrupo: string): void {
    this.service.flushGroup(claveGrupo);
  }

  /**
   * Upload pending changes to GPU for ALL groups (call once per frame).
   */
  sincronizarGPU(): void {
    this.service.flushAll();
  }

  /**
   * Apply shader injection to a material for a specific group.
   * Must be called BEFORE first render.
   */
  aplicarAMaterial(claveGrupo: string, material: unknown): void {
    this.service.applyToMaterial(claveGrupo, material);
  }

  /** Get the underlying DataTexture for a group */
  obtenerTexturaPropiedades(claveGrupo: string): unknown | null {
    return this.service.getPropertiesTexture(claveGrupo);
  }

  /** Get aggregate stats */
  obtenerEstadisticas(): BatchMaterialPropsStats {
    return this.service.getStats();
  }

  /** Dispose a specific group */
  limpiarGrupo(claveGrupo: string): void {
    this.service.disposeGroup(claveGrupo);
  }

  /** Dispose ALL GPU resources */
  limpiar(): void {
    this.service.dispose();
  }
}
