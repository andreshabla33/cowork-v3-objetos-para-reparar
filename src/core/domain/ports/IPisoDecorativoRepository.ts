/**
 * @module domain/ports/IPisoDecorativoRepository
 *
 * Puerto del Domain para persistencia + realtime de pisos decorativos.
 * El adapter Supabase implementa esto contra las RPCs `crear_piso_decorativo`
 * / `eliminar_piso_decorativo` y `postgres_changes` sobre la tabla.
 */

import type {
  CrearPisoDecorativoInput,
  PisoDecorativo,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';

export type EventoPisoDecorativo =
  | { tipo: 'INSERT'; piso: PisoDecorativo }
  | { tipo: 'UPDATE'; piso: PisoDecorativo }
  | { tipo: 'DELETE'; piso: PisoDecorativo };

export type ResultadoMutacionPisoDecorativo =
  | { ok: true; piso: PisoDecorativo }
  | { ok: false; motivo: 'no_autorizado' | 'bbox_invalido' | 'no_encontrado' | 'error' };

export interface IPisoDecorativoRepository {
  /** Lista todos los pisos decorativos del espacio (de todas las zonas + suelo principal). */
  listarPorEspacio(espacioId: string): Promise<PisoDecorativo[]>;

  /** Suscribe a cambios realtime del espacio. Retorna unsubscribe. */
  suscribirCambios(
    espacioId: string,
    callback: (evento: EventoPisoDecorativo) => void,
  ): () => void;

  crear(input: CrearPisoDecorativoInput): Promise<ResultadoMutacionPisoDecorativo>;

  eliminar(pisoId: string): Promise<{ ok: boolean; motivo?: string }>;
}
