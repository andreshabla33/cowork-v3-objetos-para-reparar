/**
 * @module application/usecases/CambiarAvatarUseCase
 * @description Use case to change the user's equipped avatar.
 * Delegates to IAvatarCatalogRepository port.
 *
 * Clean Architecture: Application layer — orchestrates avatar change
 * through repository port, no direct infrastructure dependency.
 */

import type { IAvatarCatalogRepository } from '../../domain/ports/IAvatarCatalogRepository';

export class CambiarAvatarUseCase {
  constructor(private readonly avatarCatalogRepository: IAvatarCatalogRepository) {}

  /**
   * Change the user's equipped avatar.
   */
  async ejecutar(userId: string, avatarId: string): Promise<boolean> {
    return this.avatarCatalogRepository.cambiarAvatar(userId, avatarId);
  }
}
