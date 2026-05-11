/**
 * @module domain/ports/IOcupacionAsientosRepository
 * @description Port para gestión de ocupación de asientos en el espacio 3D.
 * Tabla `ocupacion_asientos` + RPCs (ocupar, liberar, refrescar).
 */

export interface OcupacionAsientoReal {
  id: string;
  espacio_id: string;
  espacio_objeto_id: string;
  clave_asiento: string;
  usuario_id: string;
  ocupado_en: string;
  ultimo_latido_en: string;
  actualizado_en: string;
}

export type EventoOcupacionAsiento =
  | { tipo: 'INSERT'; ocupacion: OcupacionAsientoReal }
  | { tipo: 'UPDATE'; ocupacion: OcupacionAsientoReal }
  | { tipo: 'DELETE'; ocupacion: OcupacionAsientoReal };

export interface IOcupacionAsientosRepository {
  listarPorEspacio(espacioId: string): Promise<OcupacionAsientoReal[]>;
  suscribirCambios(espacioId: string, callback: (evento: EventoOcupacionAsiento) => void): () => void;
  ocupar(espacioId: string, espacioObjetoId: string, claveAsiento: string): Promise<OcupacionAsientoReal>;
  liberar(espacioObjetoId: string | null, claveAsiento: string | null): Promise<boolean>;
  refrescar(espacioObjetoId: string | null, claveAsiento: string | null): Promise<boolean>;
}
