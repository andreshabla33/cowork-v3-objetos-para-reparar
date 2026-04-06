/**
 * @module application/usecases/AutenticarConOAuthUseCase
 * @description Use case for OAuth authentication (Google, etc.).
 *
 * Clean Architecture: Application layer — orchestrates OAuth flow
 * through repository port, no direct infrastructure dependency.
 */

import type { IAuthRepository, ResultadoAuth } from '../../domain/ports/IAuthRepository';

export class AutenticarConOAuthUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  /**
   * Execute OAuth sign in with the specified provider.
   */
  async ejecutar(provider: 'google', redirectTo: string): Promise<ResultadoAuth> {
    return this.authRepository.signInWithOAuth(provider, redirectTo);
  }
}
