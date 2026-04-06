/**
 * @module application/usecases/AutenticarConEmailUseCase
 * @description Use case for email-based authentication (login + registration).
 * Delegates to IAuthRepository port, keeping business rules in the application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type { IAuthRepository, ResultadoAuth } from '../../domain/ports/IAuthRepository';

export class AutenticarConEmailUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  /**
   * Login with email and password.
   */
  async login(email: string, password: string): Promise<ResultadoAuth> {
    return this.authRepository.signInWithPassword(email, password);
  }

  /**
   * Register a new user with email, password, and name.
   */
  async registrar(
    email: string,
    password: string,
    fullName: string,
    redirectUrl: string
  ): Promise<ResultadoAuth> {
    return this.authRepository.signUp(email, password, fullName, redirectUrl);
  }
}
