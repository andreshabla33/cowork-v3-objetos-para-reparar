/**
 * @module space3d/world/batcher/batcherConstants
 *
 * Constants compartidas entre `StaticObjectBatcher` y sub-componentes
 * (capacities por grupo BatchedMesh + thresholds de LOD/frustum).
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 *   https://github.com/mrdoob/three.js/releases/tag/r170 (resize support)
 */

/**
 * Per-group capacity limits.
 *
 * CRITICAL: Must accommodate ALL color-only instances across ALL models.
 * Keyboard.glb alone contributes 21 objects × 67 meshes = 1407 instances.
 * With ~20 models, the color-only group needs ~2500+ slots.
 */
export const GROUP_MAX_INSTANCES = 4096;
export const GROUP_MAX_VERTICES = 500_000;
export const GROUP_MAX_INDICES = 1_000_000;

/** LOD distance thresholds (Fase 4C) */
export const LOD_HIDE_DISTANCE = 80;
export const LOD_HIDE_VERTEX_THRESHOLD = 500;
export const FRUSTUM_UPDATE_INTERVAL = 150; // ms between frustum cull passes
