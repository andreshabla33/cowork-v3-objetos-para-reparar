/**
 * @module domain/ports/IMiembrosEspacioRepository
 * @description Port para queries de miembros del espacio + conexiones.
 * Clean Architecture: capa Domain — sin deps externas.
 */

export interface MiembroEspacio {
  id: string;
  usuario_id: string;
  rol: string;
  cargo?: string;
  cargo_id?: string;
  cargo_ref?: { nombre: string; clave: string } | null;
  departamento?: { nombre: string } | null;
  usuario?: { nombre: string; email: string; avatar_url?: string };
  [key: string]: unknown;
}

export interface InvitacionPendiente {
  id: string;
  email: string;
  rol: string;
  espacio_id: string;
  usada: boolean;
  [key: string]: unknown;
}

export interface RegistroConexion {
  usuario_id: string;
  conectado_en: string;
  desconectado_en: string | null;
  duracion_minutos: number | null;
}

export interface IMiembrosEspacioRepository {
  listarMiembrosAceptados(espacioId: string): Promise<MiembroEspacio[]>;
  listarInvitacionesPendientes(espacioId: string): Promise<InvitacionPendiente[]>;
  listarConexionesDesde(espacioId: string, desdeISO: string): Promise<RegistroConexion[]>;
}
