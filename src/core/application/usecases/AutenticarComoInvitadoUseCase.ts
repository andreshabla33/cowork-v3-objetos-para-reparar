/**
 * @module application/usecases/AutenticarComoInvitadoUseCase
 * @description Use case for anonymous/guest authentication.
 *
 * Clean Architecture: Application layer — orchestrates anonymous auth
 * through repository port, no direct infrastructure dependency.
 */

import type { IAuthRepository, ResultadoAuth } from '../../domain/ports/IAuthRepository';

export class AutenticarComoInvitadoUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  /**
   * Execute anonymous sign in.
   */
  async ejecutar(): Promise<ResultadoAuth> {
    return this.authRepository.signInAnonymously();
  }
}
