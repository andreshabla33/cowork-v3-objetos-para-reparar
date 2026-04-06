/**
 * @module application/usecases/GestionarPerfilUseCase
 * @description Use case to manage user profile operations.
 * Handles profile photo upload/removal and name updates.
 *
 * Clean Architecture: Application layer — orchestrates profile operations
 * through repository port, no direct infrastructure dependency.
 */

import type { IProfileRepository } from '../../domain/ports/IProfileRepository';

export class GestionarPerfilUseCase {
  constructor(private readonly profileRepository: IProfileRepository) {}

  /**
   * Upload a profile photo for the user.
   * Returns the public URL or null on failure.
   */
  async subirFotoPerfil(userId: string, file: File): Promise<string | null> {
    return this.profileRepository.subirFotoPerfil(userId, file);
  }

  /**
   * Remove the user's profile photo.
   */
  async eliminarFotoPerfil(userId: string): Promise<boolean> {
    return this.profileRepository.eliminarFotoPerfil(userId);
  }

  /**
   * Update the user's display name.
   */
  async guardarNombre(userId: string, nombre: string): Promise<boolean> {
    return this.profileRepository.guardarNombre(userId, nombre);
  }
}
