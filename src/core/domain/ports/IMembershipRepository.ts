/**
 * @module domain/ports/IMembershipRepository
 * @description Port para operaciones sobre la tabla `miembros_espacio`
 * relacionadas con membresías (no con autorizaciones cross-empresa, que
 * tienen su propio port `IAutorizacionEmpresaRepository`).
 *
 * Clean Architecture: Domain define el contrato; Infrastructure (Supabase)
 * provee la implementación concreta.
 */

export interface IMembershipRepository {
  /**
   * Obtener el `empresa_id` al que pertenece un usuario dentro de un espacio.
   *
   * @param espacioId - ID del espacio (workspace).
   * @param userId - ID del usuario.
   * @returns ID de la empresa, o `null` si el usuario no pertenece a ninguna
   *   o no es miembro del espacio.
   * @throws Error si la query falla.
   */
  obtenerEmpresaDeUsuario(espacioId: string, userId: string): Promise<string | null>;

  /**
   * Contar miembros agrupados por empresa en un espacio.
   * Excluye miembros sin `empresa_id` asignado.
   *
   * @param espacioId - ID del espacio (workspace).
   * @returns Diccionario `{ [empresaId]: count }` con el número de miembros
   *   por empresa. Empresas sin miembros NO aparecen en el dict.
   * @throws Error si la query falla.
   */
  contarMiembrosPorEmpresa(espacioId: string): Promise<Record<string, number>>;
}
