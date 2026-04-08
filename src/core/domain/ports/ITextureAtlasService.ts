/**
 * @module core/domain/ports/ITextureAtlasService
 * @description Domain port for GPU texture atlas management.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 * Infrastructure adapter (TextureAtlasCanvasAdapter) provides the Canvas2D impl.
 *
 * Problem solved (Fase 3):
 *   Each unique texture = 1 GPU texture bind per draw call.
 *   Consolidating textures into a single atlas reduces texture switches
 *   and enables sharing a single material across many objects.
 *
 * Ref: Three.js r152+ — texture.channel for multi-UV support
 *   "Multiple UV channels supported: uv, uv2, uv3, uv4"
 *   https://threejs.org/docs/#api/en/textures/Texture.channel
 *
 * Ref: Array Textures (alternative to atlas for same-size textures)
 *   Eliminates edge bleeding, native wrapping/tiling, requires equal dimensions.
 *   Preferred when all textures have identical sizes.
 *
 * Strategy used here: Canvas2D compositing atlas (flexible dimensions).
 * Atlas max size: 4096×4096 (universally supported on all GPU tiers).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** UV region within the atlas [0..1] */
export interface AtlasRegion {
  /** Horizontal offset within atlas (0 = left, 1 = right) */
  u: number;
  /** Vertical offset within atlas (0 = top, 1 = bottom) */
  v: number;
  /** Width as fraction of atlas (0..1) */
  width: number;
  /** Height as fraction of atlas (0..1) */
  height: number;
}

/** UV transform for shader use (offset + scale) */
export interface UVTransform {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

/** Atlas statistics for monitoring */
export interface AtlasStats {
  /** Number of registered textures */
  textureCount: number;
  /** Atlas canvas size in pixels */
  atlasSize: number;
  /** Percentage of atlas area used (0..100) */
  usagePercent: number;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

export interface ITextureAtlasService {
  /**
   * Add a texture image to the atlas by key.
   * Returns the UV region where the texture was placed.
   *
   * @param key         Unique identifier (e.g., 'desk-wood', 'chair-fabric')
   * @param imageSource Opaque image source (HTMLImageElement | ImageBitmap at runtime)
   * @returns           UV region within the atlas
   */
  addTexture(key: string, imageSource: unknown): AtlasRegion;

  /**
   * Check if a texture is already registered.
   */
  hasTexture(key: string): boolean;

  /**
   * Get the UV region for a registered texture.
   * Returns null if not registered.
   */
  getRegion(key: string): AtlasRegion | null;

  /**
   * Get UV transform (offset + scale) suitable for a Three.js texture or shader uniform.
   * Returns null if key is not registered.
   */
  getUVTransform(key: string): UVTransform | null;

  /**
   * Get the composed atlas as a Three.js-compatible texture (opaque reference).
   * The same texture object is reused and marked needsUpdate after packing.
   */
  getAtlasTexture(): unknown;

  /**
   * Rebuild the atlas after adding/removing textures.
   * Call after batch additions for efficiency.
   */
  pack(): void;

  /**
   * Remove a texture from the atlas.
   * Requires a subsequent pack() call to reclaim space.
   */
  removeTexture(key: string): void;

  /** Get atlas statistics for monitoring */
  getStats(): AtlasStats;

  /**
   * Dispose the atlas canvas and GPU texture.
   * Call on workspace 3D unmount.
   */
  dispose(): void;
}
