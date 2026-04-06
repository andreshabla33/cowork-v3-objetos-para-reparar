/**
 * @module application/usecases/CargarAutorizacionesEmpresaUseCase
 * @description Use case for loading authorized companies in a workspace.
 * Delegates to IWorkspaceRepository port, keeping business rules in the application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository';

export class CargarAutorizacionesEmpresaUseCase {
  constructor(private readonly workspaceRepository: IWorkspaceRepository) {}

  /**
   * Load bilateral company authorizations for data access.
   * Returns array of authorized company IDs.
   */
  async execute(espacioId: string, empresaId: string): Promise<string[]> {
    return this.workspaceRepository.cargarAutorizacionesEmpresa(
      espacioId,
      empresaId
    );
  }
}
