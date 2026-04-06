/**
 * @module application/usecases/VerificarInvitacionUseCase
 * @description Verifies an invitation token's validity.
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type { IInvitacionRepository } from '../../domain/ports/IInvitacionRepository';
import type { InvitacionInfo } from '../../domain/entities/invitation';

export interface VerificacionResult {
  estado: 'valido' | 'usado' | 'expirado' | 'error';
  invitacion: InvitacionInfo | null;
}

export class VerificarInvitacionUseCase {
  constructor(private readonly repo: IInvitacionRepository) {}

  async ejecutar(tokenHash: string): Promise<VerificacionResult> {
    const { data, estado } = await this.repo.buscarPorTokenHash(tokenHash);
    return { estado, invitacion: data };
  }
}
