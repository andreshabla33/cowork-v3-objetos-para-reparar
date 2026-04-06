/**
 * @module application/usecases/ReportarModeloInvalidoUseCase
 * @description Use case to report a broken 3D model.
 * Handles cleanup of invalid models in the catalog.
 *
 * Clean Architecture: Application layer — orchestrates model cleanup
 * through repository port, no direct infrastructure dependency.
 */

import type { IAvatarCatalogRepository } from '../../domain/ports/IAvatarCatalogRepository';

export class ReportarModeloInvalidoUseCase {
  constructor(private readonly avatarCatalogRepository: IAvatarCatalogRepository) {}

  /**
   * Report and clean up an invalid 3D model.
   * Sets modelo_url to null and optionally deactivates the object.
   */
  async ejecutar(objectId: string, deactivate: boolean = false): Promise<void> {
    return this.avatarCatalogRepository.limpiarModeloInvalido(objectId, deactivate);
  }
}
