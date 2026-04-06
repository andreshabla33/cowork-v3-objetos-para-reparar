/**
 * @module application/usecases/ObtenerAnimacionesAvatarUseCase
 * @description Use case to load animations for an avatar with fallback to universal animations.
 * Orchestrates animation loading with graceful degradation.
 *
 * Clean Architecture: Application layer — orchestrates animation operations
 * through repository port, no direct infrastructure dependency.
 */

import type { IAvatarCatalogRepository, AnimacionAvatarData } from '../../domain/ports/IAvatarCatalogRepository';

export class ObtenerAnimacionesAvatarUseCase {
  constructor(private readonly avatarCatalogRepository: IAvatarCatalogRepository) {}

  /**
   * Load animations for an avatar.
   * Falls back to universal animations if none are found for the specific avatar.
   */
  async ejecutar(avatarId: string): Promise<AnimacionAvatarData[]> {
    const animacionesEspecificas = await this.avatarCatalogRepository.obtenerAnimacionesAvatar(
      avatarId
    );

    // If avatar has specific animations, use them
    if (animacionesEspecificas.length > 0) {
      return animacionesEspecificas;
    }

    // Otherwise, fall back to universal animations
    return this.avatarCatalogRepository.obtenerAnimacionesUniversales();
  }
}
