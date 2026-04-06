/**
 * @module application/usecases/RegistrarConexionEspacioUseCase
 * @description Use case for registering workspace connections and disconnections.
 * Delegates to IWorkspaceRepository port, keeping business rules in the application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository';

export class RegistrarConexionEspacioUseCase {
  constructor(private readonly workspaceRepository: IWorkspaceRepository) {}

  /**
   * Register user connection to a workspace.
   * Returns connection ID for later disconnection tracking.
   */
  async registrarConexion(
    usuarioId: string,
    espacioId: string,
    empresaId: string | null
  ): Promise<string> {
    return this.workspaceRepository.registrarConexion(
      usuarioId,
      espacioId,
      empresaId
    );
  }

  /**
   * Register disconnection timestamp.
   */
  async registrarDesconexion(conexionId: string): Promise<void> {
    return this.workspaceRepository.registrarDesconexion(conexionId);
  }

  /**
   * Clean old connection records according to retention policy.
   */
  async limpiarConexionesAntiguas(
    usuarioId: string,
    retentionDays: number
  ): Promise<void> {
    return this.workspaceRepository.limpiarConexionesAntiguas(
      usuarioId,
      retentionDays
    );
  }

  /**
   * Register activity log entry.
   */
  async registrarActividad(datos: {
    usuario_id: string;
    empresa_id: string | null;
    espacio_id: string;
    accion: 'conexion_espacio' | 'desconexion_espacio';
    entidad: string;
    entidad_id: string;
    descripcion: string;
    datos_extra: Record<string, unknown>;
  }): Promise<void> {
    return this.workspaceRepository.registrarActividad(datos);
  }
}
