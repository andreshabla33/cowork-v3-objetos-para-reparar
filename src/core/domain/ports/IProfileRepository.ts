/**
 * @module domain/ports/IProfileRepository
 * @description Port interface for user profile operations.
 * Decouples profile management logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 */

export interface IProfileRepository {
  /**
   * Upload a profile photo for a user.
   * Updates the avatar_url in the usuarios table.
   * Returns the public URL or null on failure.
   */
  subirFotoPerfil(userId: string, file: File): Promise<string | null>;

  /**
   * Remove the profile photo for a user.
   * Sets avatar_url to null.
   */
  eliminarFotoPerfil(userId: string): Promise<boolean>;

  /**
   * Save the user's display name.
   */
  guardarNombre(userId: string, nombre: string): Promise<boolean>;

  /**
   * Persist the user's availability status and optional custom text.
   * Updates `usuarios.estado_disponibilidad`, `estado_personalizado`,
   * `estado_actualizado_en`. Pass `statusText: null` to clear the custom
   * text; pass `undefined` to leave it unchanged.
   */
  actualizarEstadoDisponibilidad(
    userId: string,
    status: string,
    statusText?: string | null,
  ): Promise<boolean>;
}
