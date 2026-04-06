/**
 * @module application/usecases/CargarDatosEmpresaUseCase
 * @description Use case for loading user's empresa and departamento in a workspace.
 * Delegates to IWorkspaceRepository port, keeping business rules in the application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type {
  IWorkspaceRepository,
  MiembroEspacioData,
} from '../../domain/ports/IWorkspaceRepository';

export class CargarDatosEmpresaUseCase {
  constructor(private readonly workspaceRepository: IWorkspaceRepository) {}

  /**
   * Load empresa_id and departamento_id for a user in a workspace.
   * Returns null if user is not a member of the workspace.
   */
  async execute(
    usuarioId: string,
    espacioId: string
  ): Promise<MiembroEspacioData | null> {
    return this.workspaceRepository.cargarMiembroEspacio(
      usuarioId,
      espacioId
    );
  }
}
