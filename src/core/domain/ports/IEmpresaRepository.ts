/**
 * @module domain/ports/IEmpresaRepository
 * @description Port para operaciones sobre la tabla `empresas` del workspace.
 *
 * Clean Architecture: Domain define el contrato; Infrastructure (Supabase)
 * provee la implementación concreta.
 */

/**
 * Empresa básica (subset de columnas usado por UI de marketplace/settings).
 */
export interface EmpresaBasica {
  id: string;
  nombre: string;
  logo_url?: string | null;
}

export interface IEmpresaRepository {
  /**
   * Cargar todas las empresas activas de un espacio, ordenadas por nombre.
   *
   * @param espacioId - ID del espacio (workspace).
   * @returns Lista de empresas básicas (id, nombre, logo_url).
   * @throws Error si la query falla.
   */
  cargarEmpresasDeEspacio(espacioId: string): Promise<EmpresaBasica[]>;
}
