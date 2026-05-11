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

export interface EmpresaCompleta {
  id: string;
  nombre: string;
  nit_rut?: string | null;
  industria?: string | null;
  tamano?: string | null;
  sitio_web?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email_contacto?: string | null;
  descripcion?: string | null;
  logo_url?: string | null;
  espacio_id: string;
  creado_por?: string | null;
  actualizado_en?: string;
}

export interface EmpresaUpsertPayload {
  nombre: string;
  nit_rut?: string | null;
  industria?: string | null;
  tamano?: string | null;
  sitio_web?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email_contacto?: string | null;
  descripcion?: string | null;
  actualizado_en: string;
}

export interface IEmpresaRepository {
  cargarEmpresasDeEspacio(espacioId: string): Promise<EmpresaBasica[]>;
  obtenerEmpresaIdDeUsuario(espacioId: string, usuarioId: string): Promise<string | null>;
  obtenerEmpresaCompleta(empresaId: string, espacioId: string): Promise<EmpresaCompleta | null>;
  actualizarEmpresa(empresaId: string, payload: EmpresaUpsertPayload): Promise<void>;
  crearEmpresa(payload: EmpresaUpsertPayload, espacioId: string, creadorId: string): Promise<EmpresaCompleta>;
}
