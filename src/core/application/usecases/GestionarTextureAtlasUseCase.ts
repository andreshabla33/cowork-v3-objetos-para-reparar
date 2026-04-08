/**
 * @module core/application/usecases/GestionarTextureAtlasUseCase
 * @description Use case: Manage GPU texture atlas for consolidated texture binding.
 *
 * Clean Architecture: Application layer — orchestrates ITextureAtlasService port.
 * No Three.js or Canvas2D dependencies — works with opaque types.
 *
 * Problem solved (Fase 3):
 *   Each unique texture = 1 GPU texture bind per draw call.
 *   Consolidating textures into a single atlas reduces texture switches
 *   and enables sharing a single material across many objects.
 *
 * Ref: Three.js r152+ — texture.channel (multi-UV support)
 *   https://threejs.org/docs/#api/en/textures/Texture.channel
 *
 * Ref: Array Textures (equal-size alternative)
 *   Eliminates edge bleeding, native wrapping — preferred when all textures match.
 */

import type {
  ITextureAtlasService,
  AtlasRegion,
  UVTransform,
  AtlasStats,
} from '../../domain/ports/ITextureAtlasService';

export class GestionarTextureAtlasUseCase {
  constructor(private readonly service: ITextureAtlasService) {}

  /**
   * Add a texture image to the atlas by key.
   * Returns the UV region within the atlas.
   *
   * @param clave       Unique key, e.g. 'desk-wood', 'chair-fabric'
   * @param fuenteImagen Opaque image source (HTMLImageElement | ImageBitmap at runtime)
   */
  agregarTextura(clave: string, fuenteImagen: unknown): AtlasRegion {
    return this.service.addTexture(clave, fuenteImagen);
  }

  /**
   * Check if a texture is already registered.
   */
  tieneTextura(clave: string): boolean {
    return this.service.hasTexture(clave);
  }

  /**
   * Get the UV region for a registered texture.
   * Returns null if not registered.
   */
  obtenerRegion(clave: string): AtlasRegion | null {
    return this.service.getRegion(clave);
  }

  /**
   * Get UV transform (offset + scale) for a Three.js texture or shader uniform.
   * Returns null if key is not registered.
   */
  obtenerTransformacionUV(clave: string): UVTransform | null {
    return this.service.getUVTransform(clave);
  }

  /**
   * Get the composed atlas as a Three.js-compatible texture.
   * Same texture object is reused; marked needsUpdate after packing.
   */
  obtenerTexturaAtlas(): unknown {
    return this.service.getAtlasTexture();
  }

  /**
   * Rebuild the atlas after adding/removing textures.
   * Call after batch additions for efficiency.
   */
  empaquetar(): void {
    this.service.pack();
  }

  /**
   * Add a texture and immediately rebuild the atlas.
   * Convenience method for single-texture additions.
   */
  agregarYEmpaquetar(clave: string, fuenteImagen: unknown): AtlasRegion {
    const region = this.service.addTexture(clave, fuenteImagen);
    this.service.pack();
    return region;
  }

  /**
   * Remove a texture from the atlas.
   * Requires a subsequent empaquetar() call to reclaim space.
   */
  eliminarTextura(clave: string): void {
    this.service.removeTexture(clave);
  }

  /**
   * Get atlas statistics for monitoring dashboards.
   */
  obtenerEstadisticas(): AtlasStats {
    return this.service.getStats();
  }

  /**
   * Dispose the atlas canvas and GPU texture.
   * Call on workspace 3D unmount.
   */
  limpiar(): void {
    this.service.dispose();
  }
}
