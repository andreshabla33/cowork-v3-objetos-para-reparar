/**
 * @module application/usecases/CargarReunionesUseCase
 * @description Loads all scheduled meetings for a workspace.
 * Clean Architecture: Application layer — orchestrates meeting fetch
 * through repository port.
 */

import { logger } from '@/lib/logger';
import type {
  IMeetingRepository,
  ReunionProgramadaData,
} from '../../domain/ports/IMeetingRepository';

const log = logger.child('cargar-reuniones');

export interface CargarReunionesInput {
  espacioId: string;
}

export interface CargarReunionesOutput {
  reuniones: ReunionProgramadaData[];
}

/**
 * Load all scheduled meetings for a workspace.
 * Includes creator, room, and participant details.
 */
export class CargarReunionesUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Execute the use case: fetch all meetings for the workspace.
   *
   * @param input Workspace ID
   * @returns Meetings list (empty array on failure)
   */
  async ejecutar(input: CargarReunionesInput): Promise<CargarReunionesOutput> {
    log.info('Loading meetings for workspace', {
      espacioId: input.espacioId,
    });

    try {
      const reuniones = await this.repo.obtenerReuniones(input.espacioId);

      log.info('Meetings loaded successfully', {
        espacioId: input.espacioId,
        count: reuniones.length,
      });

      return { reuniones };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load meetings', {
        error: message,
        espacioId: input.espacioId,
      });

      return { reuniones: [] };
    }
  }
}
