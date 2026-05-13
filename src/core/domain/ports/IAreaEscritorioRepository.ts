/**
 * @module domain/ports/IAreaEscritorioRepository
 *
 * Puerto del Domain para persistencia + realtime de `AreaEscritorio`.
 * El adapter (Infrastructure) implementa esto contra Supabase via RPCs y
 * postgres_changes; los use cases (Application) consumen solo este puerto.
 */

import type { AreaEscritorio, BboxAreaEscritorio } from '@/src/core/domain/entities/espacio3d/AreaEscritorio';

export type EventoAreaEscritorio =
  | { tipo: 'INSERT'; area: AreaEscritorio }
  | { tipo: 'UPDATE'; area: AreaEscritorio }
  | { tipo: 'DELETE'; area: AreaEscritorio };

/**
 * Resultado de operaciones de mutación. Modela errores de negocio
 * explícitamente en lugar de throw para que la UI pueda renderizar
 * notificaciones sin try/catch boilerplate.
 */
export type ResultadoMutacionAreaEscritorio =
  | { ok: true; area: AreaEscritorio }
  | {
      ok: false;
      motivo:
        | 'no_autorizado'              // RLS denegó (no admin / no miembro)
        | 'ya_reclamada'                // race: otro usuario reclamó primero
        | 'pre_asignada_a_otro'         // intento de reclamar desk pre-asignado
        | 'no_es_mi_area'               // intento de liberar área ajena
        | 'no_encontrada'               // id inválido / borrada
        | 'error_red'                   // RPC failed (timeout, 500, etc.)
        | 'error';
    };

export interface IAreaEscritorioRepository {
  /** Lista todas las áreas del espacio. */
  listarPorEspacio(espacioId: string): Promise<AreaEscritorio[]>;

  /** Suscribe a cambios realtime. Retorna unsubscribe. */
  suscribirCambios(
    espacioId: string,
    callback: (evento: EventoAreaEscritorio) => void,
  ): () => void;

  /**
   * Miembro reclama un área. Idempotente si ya es del mismo usuario.
   * Server-side valida: no reclamada por otro, no pre-asignada a otro.
   */
  reclamar(areaId: string): Promise<ResultadoMutacionAreaEscritorio>;

  /**
   * Miembro libera su área. Server-side valida que el caller es el dueño.
   */
  liberar(areaId: string): Promise<ResultadoMutacionAreaEscritorio>;

  // ── Admin operations ─────────────────────────────────────────────────

  /**
   * Admin crea un área nueva en el espacio. Recibe bbox + nombre + flags.
   * Server-side valida que el caller es admin del espacio.
   */
  designar(input: {
    espacioId: string;
    bbox: BboxAreaEscritorio;
    nombre: string;
    audioAislado: boolean;
  }): Promise<ResultadoMutacionAreaEscritorio>;

  /**
   * Admin pre-asigna un área a un miembro (o quita la pre-asignación con
   * `usuarioId=null`). NO reclama por el miembro — solo reserva el slot.
   */
  asignar(areaId: string, usuarioId: string | null): Promise<ResultadoMutacionAreaEscritorio>;

  /**
   * Admin re-asigna un área ya reclamada a otro miembro. Server-side libera
   * el reclamo previo y aplica el nuevo asignado_a.
   */
  reasignar(areaId: string, nuevoUsuarioId: string | null): Promise<ResultadoMutacionAreaEscritorio>;

  /** Admin borra un área del mapa. */
  eliminar(areaId: string): Promise<{ ok: boolean; motivo?: string }>;
}
