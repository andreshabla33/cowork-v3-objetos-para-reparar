/**
 * @module application/usecases/EliminarReunionUseCase
 * @description Deletes a scheduled meeting.
 * Clean Architecture: Application layer — orchestrates meeting deletion
 * through repository port.
 */

import { logger } from '@/lib/logger';
import type { IMeetingRepository } from '../../domain/ports/IMeetingRepository';

const log = logger.child('eliminar-reunion');

export interface EliminarReunionInput {
  reunionId: string;
}

export interface EliminarReunionOutput {
  success: boolean;
  error?: string;
}

/**
 * Delete a scheduled meeting by ID.
 */
export class EliminarReunionUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Execute the use case: delete a meeting.
   *
   * @param input Meeting ID
   * @returns Success status
   */
  async ejecutar(input: EliminarReunionInput): Promise<EliminarReunionOutput> {
    log.info('Deleting meeting', { reunionId: input.reunionId });

    try {
      const success = await this.repo.eliminarReunion(input.reunionId);

      if (!success) {
        log.warn('Failed to delete meeting', { reunionId: input.reunionId });
        return {
          success: false,
          error: 'Failed to delete meeting',
        };
      }

      log.info('Meeting deleted successfully', { reunionId: input.reunionId });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception deleting meeting', {
        error: message,
        reunionId: input.reunionId,
      });

      return {
        success: false,
        error: message,
      };
    }
  }
}
