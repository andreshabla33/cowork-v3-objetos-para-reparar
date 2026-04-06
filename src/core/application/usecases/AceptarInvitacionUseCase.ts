/**
 * @module application/usecases/AceptarInvitacionUseCase
 * @description Accepts a workspace invitation for the authenticated user.
 * Clean Architecture: Application layer — orchestrates membership upsert
 * and invitation mark-as-used through repository port.
 */

import type { IInvitacionRepository, AceptarInvitacionPayload } from '../../domain/ports/IInvitacionRepository';
import type { InvitacionInfo } from '../../domain/entities/invitation';
import { logger } from '../../../../lib/logger';

const log = logger.child('aceptar-invitacion');

export interface AceptarInvitacionInput {
  userId: string;
  userEmail: string;
  invitacion: InvitacionInfo;
  tokenHash: string;
}

export class AceptarInvitacionUseCase {
  constructor(private readonly repo: IInvitacionRepository) {}

  async ejecutar(input: AceptarInvitacionInput): Promise<void> {
    // Domain rule: user email must match invitation email
    if (input.userEmail.toLowerCase() !== input.invitacion.email.toLowerCase()) {
      throw new Error(`Debes iniciar sesión con ${input.invitacion.email}`);
    }

    const payload: AceptarInvitacionPayload = {
      espacio_id: input.invitacion.espacio.id,
      usuario_id: input.userId,
      rol: input.invitacion.rol,
      aceptado: true,
      aceptado_en: new Date().toISOString(),
      empresa_id: input.invitacion.empresa_id,
      onboarding_completado: false,
    };

    log.info('Accepting invitation', { espacio: input.invitacion.espacio.nombre });
    await this.repo.aceptar(payload, input.tokenHash);
  }
}
