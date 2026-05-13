/**
 * @module domain/ports/ITerrenoRepository
 *
 * Clean Architecture — Domain port.
 *
 * Contrato para persistir/leer el terreno (suelo + montañas + ríos) de un
 * espacio 3D. La infraestructura (Supabase) implementa este puerto;
 * la capa de aplicación lo consume vía use cases.
 *
 * Tabla destino: `espacio_terreno` (1:1 con `espacios_trabajo`).
 * Migración: supabase/migrations/20260504_terreno_rios.sql
 */

import type { TerrenoEntity } from '@/src/core/domain/entities/espacio3d/TerrenoEntity';

/** Evento Realtime emitido por la suscripción a `espacio_terreno`. */
export type EventoTerreno =
  | { tipo: 'INSERT'; terreno: TerrenoEntity }
  | { tipo: 'UPDATE'; terreno: TerrenoEntity }
  | { tipo: 'DELETE'; espacioId: string };

export interface ITerrenoRepository {
  /**
   * Lee el terreno del espacio. Si el espacio aún no tiene terreno
   * configurado, retorna `null` — el consumidor debe aplicar
   * `TERRENO_FLAT_DEFAULT` como fallback.
   */
  obtener(espacioId: string): Promise<TerrenoEntity | null>;

  /**
   * Inserta o actualiza (upsert por `espacio_id`) el terreno del espacio.
   * El enforcement de permisos (owner/admin/super_admin) vive en RLS.
   */
  guardar(terreno: Omit<TerrenoEntity, 'id'>): Promise<TerrenoEntity>;

  /**
   * Elimina el terreno del espacio (vuelve al default `flat`).
   */
  eliminar(espacioId: string): Promise<void>;

  /**
   * Suscribe a cambios Realtime del terreno de un espacio. El callback se
   * dispara en INSERT/UPDATE/DELETE filtrados por `espacio_id`. Devuelve
   * un teardown que cancela la suscripción.
   *
   * Ref: https://supabase.com/docs/guides/realtime/postgres-changes
   */
  suscribirCambios(espacioId: string, callback: (evento: EventoTerreno) => void): () => void;
}
