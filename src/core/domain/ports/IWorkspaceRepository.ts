/**
 * @module domain/ports/IWorkspaceRepository
 * @description Port interface for workspace membership and authorization queries.
 * Decouples workspace data loading from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — from() / select() / eq() / maybeSingle().
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Datos del miembro en un espacio (empresa y departamento asignados)
 */
export interface MiembroEspacioData {
  empresa_id: string | null;
  departamento_id: string | null;
}

/**
 * Autorización bilateral entre empresas en un espacio
 */
export interface AutorizacionEmpresa {
  empresa_origen_id: string;
  empresa_destino_id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  espacio_id: string;
}

export interface IWorkspaceRepository {
  /**
   * Cargar datos de membresía del usuario en un espacio.
   * Retorna empresa_id y departamento_id asignados.
   *
   * @param usuarioId — UUID del usuario autenticado
   * @param espacioId — UUID del espacio
   * @returns MiembroEspacioData | null si no hay registro
   */
  cargarMiembroEspacio(
    usuarioId: string,
    espacioId: string
  ): Promise<MiembroEspacioData | null>;

  /**
   * Cargar autorizaciones bilaterales de acceso entre empresas.
   * Retorna lista de empresas autorizadas (origen e inversa).
   *
   * @param espacioId — UUID del espacio
   * @param empresaId — UUID de la empresa del usuario actual
   * @returns array de IDs de empresas autorizadas
   */
  cargarAutorizacionesEmpresa(
    espacioId: string,
    empresaId: string
  ): Promise<string[]>;

  /**
   * Registrar conexión del usuario a un espacio.
   * Retorna el ID de la conexión para posterior actualización.
   *
   * @param usuarioId — UUID del usuario
   * @param espacioId — UUID del espacio
   * @param empresaId — UUID de la empresa (puede ser null)
   * @returns ID de la conexión registrada
   */
  registrarConexion(
    usuarioId: string,
    espacioId: string,
    empresaId: string | null
  ): Promise<string>;

  /**
   * Registrar desconexión del usuario.
   * Actualiza timestamp y marca como desconectado.
   *
   * @param conexionId — ID de la conexión a actualizar
   */
  registrarDesconexion(conexionId: string): Promise<void>;

  /**
   * Limpiar registros de conexión antiguos según política de retención.
   *
   * @param usuarioId — UUID del usuario
   * @param retentionDays — días de retención (elimina registros más antiguos)
   */
  limpiarConexionesAntiguas(
    usuarioId: string,
    retentionDays: number
  ): Promise<void>;

  /**
   * Registrar actividad de conexión en el log de auditoría.
   *
   * @param datos — información de la actividad
   */
  registrarActividad(datos: {
    usuario_id: string;
    empresa_id: string | null;
    espacio_id: string;
    accion: 'conexion_espacio' | 'desconexion_espacio';
    entidad: string;
    entidad_id: string;
    descripcion: string;
    datos_extra: Record<string, unknown>;
  }): Promise<void>;
}
