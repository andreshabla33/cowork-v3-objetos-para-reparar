/**
 * @module application/usecases/CapturarThumbnailUseCase
 * @description Use case to upload thumbnails for avatars or 3D objects.
 * Handles thumbnail capture and storage through repository.
 *
 * Clean Architecture: Application layer — orchestrates thumbnail operations
 * through repository port, no direct infrastructure dependency.
 */

import type { IAvatarCatalogRepository } from '../../domain/ports/IAvatarCatalogRepository';

export enum TipoThumbnail {
  AVATAR = 'avatar',
  OBJETO = 'objeto',
}

export class CapturarThumbnailUseCase {
  constructor(private readonly avatarCatalogRepository: IAvatarCatalogRepository) {}

  /**
   * Upload a thumbnail for an avatar or object.
   * Returns the public URL or null on failure.
   */
  async ejecutar(
    entityId: string,
    blob: Blob,
    tipo: TipoThumbnail
  ): Promise<string | null> {
    if (tipo === TipoThumbnail.AVATAR) {
      return this.avatarCatalogRepository.subirThumbnailAvatar(entityId, blob);
    }

    return this.avatarCatalogRepository.subirThumbnailObjeto(entityId, blob);
  }
}
