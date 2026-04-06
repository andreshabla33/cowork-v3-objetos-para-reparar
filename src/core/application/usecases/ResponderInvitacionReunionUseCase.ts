/**
 * @module application/usecases/ResponderInvitacionReunionUseCase
 * @description Updates a participant's response to a meeting invitation.
 * Clean Architecture: Application layer — orchestrates participant status update
 * through repository port.
 */

import { logger } from '@/lib/logger';
import type { IMeetingRepository } from '../../domain/ports/IMeetingRepository';

const log = logger.child('responder-invitacion-reunion');

export interface ResponderInvitacionReunionInput {
  reunionId: string;
  usuarioId: string;
  estado: 'aceptado' | 'rechazado' | 'tentativo';
}

export interface ResponderInvitacionReunionOutput {
  success: boolean;
  error?: string;
}

/**
 * Update a participant's response status for a meeting.
 * User can accept, decline, or mark as tentative.
 */
export class ResponderInvitacionReunionUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Execute the use case: update participant response.
   *
   * @param input Meeting ID, user ID, and response status
   * @returns Success status
   */
  async ejecutar(
    input: ResponderInvitacionReunionInput
  ): Promise<ResponderInvitacionReunionOutput> {
    log.info('Updating participant response', {
      reunionId: input.reunionId,
      usuarioId: input.usuarioId,
      estado: input.estado,
    });

    try {
      const success = await this.repo.actualizarRespuestaParticipante(
        input.reunionId,
        input.usuarioId,
        input.estado
      );

      if (!success) {
        log.warn('Failed to update participant response', {
          reunionId: input.reunionId,
          usuarioId: input.usuarioId,
        });
        return {
          success: false,
          error: 'Failed to update response',
        };
      }

      log.info('Participant response updated successfully', {
        reunionId: input.reunionId,
        usuarioId: input.usuarioId,
        estado: input.estado,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating participant response', {
        error: message,
        reunionId: input.reunionId,
        usuarioId: input.usuarioId,
      });

      return {
        success: false,
        error: message,
      };
    }
  }
}
