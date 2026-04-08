/**
 * @module core/domain/ports/IBuiltinWallGeometryService
 * @description Domain port for procedural wall geometry generation and merging.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 * Infrastructure adapter (GeometriaProceduralParedesAdapter) provides the Three.js impl.
 *
 * Problem solved (Fase 5A / 5B):
 *   Builtin wall objects generate procedural geometry (ExtrudeGeometry with holes,
 *   BoxGeometry for frames/glass/metal) that must be merged by material category
 *   to reduce draw calls from ~330 to ~3-5.
 *
 * Ref: Three.js r182 — BufferGeometryUtils.mergeGeometries
 *   https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
 * Ref: Three.js r182 — ExtrudeGeometry
 *   https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry
 */

// ─── Domain Constants ──────────────────────────────────────────────────────

/**
 * Z-offset factor for glass panes relative to wall depth.
 *
 * Glass panes are placed at `wallDepth * GLASS_Z_OFFSET_FACTOR` instead of z=0
 * to prevent z-fighting with the wall extrusion's inner hole side faces.
 * Value of 0.15 (15% of wall depth) provides sufficient separation without
 * visually displacing the glass from its hole.
 *
 * @see GeometriaProceduralParedesAdapter._generarAberturasGeometria
 */
export const GLASS_Z_OFFSET_FACTOR = 0.15;

/**
 * Minimum glass pane thickness in meters.
 * Clamped to prevent degenerate geometry on very thin walls.
 */
export const GLASS_MIN_THICKNESS = 0.003;

/**
 * Maximum glass pane thickness in meters.
 */
export const GLASS_MAX_THICKNESS = 0.025;

/**
 * Opaque/metal materials in the merge pipeline MUST use FrontSide (not DoubleSide).
 *
 * Root cause (2026-04-08): When all ~240 opaque walls are merged into a single
 * draw call, `side: DoubleSide` causes the GPU to render back faces of the
 * ExtrudeGeometry's inner hole-perimeter faces. These back faces write to the
 * depth buffer at Z positions that overlap with glass panes, causing glass to
 * fail depth test and become invisible.
 *
 * In edit mode (individual meshes), Three.js sorts transparent objects
 * back-to-front per-mesh, so this issue does not manifest.
 *
 * Ref: Three.js Issue #2476  — DoubleSide + transparent depth artifacts
 * Ref: Three.js Issue #32570 — WebGPU r182 transparent pipeline regression
 * Ref: Three.js docs — Material.side
 *      https://threejs.org/docs/#api/en/materials/Material.side
 */
export const MERGED_OPAQUE_SIDE = 0; // THREE.FrontSide (avoids Three.js import in domain)

// ─── Types ──────────────────────────────────────────────────────────────────

/** Material category for merged geometry buckets */
export type MaterialCategory = 'opaque' | 'glass' | 'metal';

/** Opaque geometry reference (avoids Three.js dep in domain) */
export type GeometryRef = unknown;

/** A geometry classified by material category, ready for merging */
export interface CategorizedGeometry {
  geometry: GeometryRef;
  category: MaterialCategory;
}

/** Result of merging geometries by material category */
export interface MergedGeometryGroup {
  geometry: GeometryRef;
  category: MaterialCategory;
}

/** Statistics for logging/monitoring */
export interface MergeStats {
  inputObjects: number;
  processed: number;
  skipped: number;
  mergedGroups: number;
  categories: MaterialCategory[];
  bucketSizes: Record<MaterialCategory, number>;
}

/** Minimal object data needed for geometry generation (avoids coupling to EspacioObjeto) */
export interface WallObjectData {
  id: string;
  built_in_geometry?: string | null;
  built_in_color?: string | null;
  ancho?: number | string | null;
  alto?: number | string | null;
  profundidad?: number | string | null;
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_y?: number | null;
  configuracion_geometria?: unknown;
}

// ─── Port Interface ─────────────────────────────────────────────────────────

export interface IBuiltinWallGeometryService {
  /**
   * Generate all categorized geometries for a single wall object in world-space.
   * Produces opaque (wall body), glass (window panels), and metal (frames) geometries.
   *
   * @param objeto  Wall object data (position, rotation, dimensions, config)
   * @returns       Array of categorized geometries, or empty if the object is invalid
   */
  generarGeometriasObjeto(objeto: WallObjectData): CategorizedGeometry[];

  /**
   * Normalize a geometry for merge compatibility.
   * Converts to non-indexed, standardizes attributes, optionally injects vertex colors.
   *
   * @param geometry        Source geometry (will be cloned/converted, not mutated)
   * @param vertexColor     Hex color to inject as vertex color attribute
   * @param skipVertexColor If true, removes the color attribute (for glass)
   * @returns               Normalized geometry ready for mergeBufferGeometries
   */
  normalizarParaMerge(geometry: GeometryRef, vertexColor?: string, skipVertexColor?: boolean): GeometryRef;

  /**
   * Merge an array of compatible geometries into a single geometry.
   *
   * @param geometries  Array of normalized, attribute-compatible geometries
   * @returns           Merged geometry, or null if merge fails
   */
  mergearGeometrias(geometries: GeometryRef[]): GeometryRef | null;

  /**
   * Dispose a geometry and free its GPU resources.
   */
  disposeGeometry(geometry: GeometryRef): void;
}
