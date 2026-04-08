/**
 * @module core/domain/ports/IBatchMaterialPropertiesService
 * @description Domain port for per-instance material properties in BatchedMesh.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 *
 * Problem solved (Fase 4D):
 *   Multiple BatchedMesh groups exist because materials differ in color/metalness/roughness.
 *   With DataTexture packing, ALL color-only objects can share ONE BatchedMesh with
 *   ONE material, while each instance gets unique color, metalness, and roughness
 *   sampled from a DataTexture in the shader.
 *
 *   This collapses N color-only groups → 1 group = 1 draw call.
 *
 * Multi-group design:
 *   Each material group (identified by groupKey) gets its own DataTexture +
 *   shader injection. This matches MultiBatch architecture where each group
 *   is a separate BatchedMesh with its own material.
 *
 * Technique (confirmed from official sources):
 *   - Material properties packed into DataTexture (RGBA per instance)
 *   - Shader injection via material.onBeforeCompile()
 *   - Instance index accessed via gl_DrawID in vertex shader
 *   - Fragment shader overrides diffuseColor, metalnessFactor, roughnessFactor
 *
 * Ref: gkjohnson/batched-material-properties-demo
 *   https://github.com/gkjohnson/batched-material-properties-demo
 * Ref: Three.js r170 — Material.onBeforeCompile
 *   https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
 * Ref: Three.js r170 — DataTexture
 *   https://threejs.org/docs/#api/en/textures/DataTexture
 * Ref: Three.js r170 — batching_pars_vertex.glsl (gl_DrawID)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-instance material properties (PBR) */
export interface InstanceMaterialProps {
  /** Diffuse color RGB [0..1] */
  r: number;
  g: number;
  b: number;
  /** Metalness [0..1] — 0 = dielectric, 1 = metal */
  metalness: number;
  /** Roughness [0..1] — 0 = mirror, 1 = diffuse */
  roughness: number;
}

/** Stats for monitoring (per group) */
export interface BatchMaterialPropsGroupStats {
  /** Number of instances with properties set */
  instanceCount: number;
  /** DataTexture dimensions */
  textureWidth: number;
  textureHeight: number;
  /** Whether the texture needs GPU re-upload */
  needsUpdate: boolean;
}

/** Aggregate stats across all groups */
export interface BatchMaterialPropsStats {
  /** Number of active groups */
  groupCount: number;
  /** Total instances across all groups */
  totalInstances: number;
  /** Per-group details */
  groups: Map<string, BatchMaterialPropsGroupStats>;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

export interface IBatchMaterialPropertiesService {
  /**
   * Initialize a DataTexture for a material group.
   * @param groupKey      Unique key identifying the material group (matches MultiBatch key)
   * @param maxInstances  Maximum instance count (matches BatchedMesh capacity for this group)
   */
  initializeGroup(groupKey: string, maxInstances: number): void;

  /**
   * Check if a group has been initialized.
   */
  hasGroup(groupKey: string): boolean;

  /**
   * Set material properties for a specific instance within a group.
   * Updates the DataTexture data array; call flushGroup() to upload to GPU.
   *
   * @param groupKey       Group this instance belongs to
   * @param instanceIndex  Integer index of the instance in the BatchedMesh
   * @param props          PBR material properties for this instance
   */
  setInstanceProperties(groupKey: string, instanceIndex: number, props: InstanceMaterialProps): void;

  /**
   * Batch-set properties for multiple instances within a group.
   * More efficient than calling setInstanceProperties in a loop.
   */
  setMultipleInstanceProperties(
    groupKey: string,
    entries: Array<{ index: number; props: InstanceMaterialProps }>,
  ): void;

  /**
   * Upload pending changes to GPU for a specific group.
   * Call once per frame after all setInstanceProperties calls.
   */
  flushGroup(groupKey: string): void;

  /**
   * Upload pending changes to GPU for ALL groups.
   * Convenience method — call once per frame.
   */
  flushAll(): void;

  /**
   * Apply shader injection to a material for a specific group.
   * Uses onBeforeCompile to inject DataTexture sampling into vertex/fragment shaders.
   * Must be called BEFORE the material is first compiled (before first render).
   *
   * @param groupKey  Group whose DataTexture to bind
   * @param material  Opaque material reference (THREE.Material at runtime)
   */
  applyToMaterial(groupKey: string, material: unknown): void;

  /**
   * Get the properties DataTexture for a group.
   * Returns opaque reference (THREE.DataTexture at runtime).
   */
  getPropertiesTexture(groupKey: string): unknown | null;

  /** Get aggregate stats for monitoring */
  getStats(): BatchMaterialPropsStats;

  /** Dispose a specific group's GPU resources */
  disposeGroup(groupKey: string): void;

  /** Dispose ALL GPU resources */
  dispose(): void;
}
