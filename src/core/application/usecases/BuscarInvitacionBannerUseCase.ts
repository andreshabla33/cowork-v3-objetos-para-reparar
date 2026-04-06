/**
 * @module application/usecases/BuscarInvitacionBannerUseCase
 * @description Use case to look up invitation banner data from a URL token.
 * Hashes the raw token client-side (SHA-256) and queries via IAuthRepository.
 *
 * Clean Architecture: Application layer — orchestrates token hashing and
 * invitation lookup through repository port, no direct infrastructure dependency.
 */

import type { IAuthRepository, InvitacionBannerData } from '../../domain/ports/IAuthRepository';

export class BuscarInvitacionBannerUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  /**
   * Look up invitation banner data by raw token.
   * Hashes the token and queries the database.
   */
  async ejecutar(rawToken: string): Promise<InvitacionBannerData | null> {
    const tokenHash = await this.hashToken(rawToken);
    return this.authRepository.buscarInvitacionPorTokenHash(tokenHash);
  }

  /**
   * Hash a token using SHA-256.
   * Matches the server-side token hashing mechanism.
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
