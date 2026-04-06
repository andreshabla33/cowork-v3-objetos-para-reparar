/**
 * @module application/usecases/CargarMiembrosEspacioUseCase
 * @description Loads accepted members of a workspace.
 * Shared utility for meetings, chat, and other features requiring member lists.
 * Clean Architecture: Application layer — orchestrates member fetch
 * through repository port.
 */

import { logger } from '@/lib/logger';
import type {
  IMeetingRepository,
  MiembroBasicoData,
} from '../../domain/ports/IMeetingRepository';

const log = logger.child('cargar-miembros-espacio');

export interface CargarMiembrosEspacioInput {
  espacioId: string;
}

export interface CargarMiembrosEspacioOutput {
  miembros: MiembroBasicoData[];
}

/**
 * Load all accepted members of a workspace.
 * Returns basic user information for display and selection.
 */
export class CargarMiembrosEspacioUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Execute the use case: fetch all workspace members.
   *
   * @param input Workspace ID
   * @returns Members list (empty array on failure)
   */
  async ejecutar(
    input: CargarMiembrosEspacioInput
  ): Promise<CargarMiembrosEspacioOutput> {
    log.info('Loading workspace members', {
      espacioId: input.espacioId,
    });

    try {
      const miembros = await this.repo.obtenerMiembrosEspacio(
        input.espacioId
      );

      log.info('Workspace members loaded successfully', {
        espacioId: input.espacioId,
        count: miembros.length,
      });

      return { miembros };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load workspace members', {
        error: message,
        espacioId: input.espacioId,
      });

      return { miembros: [] };
    }
  }
}
