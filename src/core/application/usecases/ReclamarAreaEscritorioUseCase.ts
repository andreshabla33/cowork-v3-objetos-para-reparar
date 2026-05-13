/**
 * @module application/usecases/ReclamarAreaEscritorioUseCase
 *
 * Use case que reclama un AreaEscritorio para el usuario actual. Encapsula
 * la validación del Domain (puedoReclamarAreaEscritorio) ANTES de hacer la
 * llamada al puerto, para fallar rápido (sin round-trip) si la regla del
 * negocio ya descarta la operación.
 *
 * Clean Architecture: depende solo del Domain (entity + port). Sin acceso a
 * Supabase ni a React.
 */

import {
  puedoReclamarAreaEscritorio,
  type AreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface ReclamarAreaEscritorioInput {
  /** Área a reclamar (snapshot client-side). El server-side hace la fuente
   * autoritativa de "ya_reclamada" vs estado cliente stale. */
  area: AreaEscritorio;
  /** ID del usuario que ejecuta la acción (auth.uid() en el server). */
  usuarioId: string;
}

export class ReclamarAreaEscritorioUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: ReclamarAreaEscritorioInput): Promise<ResultadoMutacionAreaEscritorio> {
    // Pre-check del Domain. Si la policy local ya dice "no se puede",
    // evitamos round-trip + el RPC server-side hubiera retornado el mismo
    // error. La doble verificación (cliente + server) es deliberada: el
    // cliente da feedback inmediato, el server es la fuente autoritativa
    // ante races multi-tab.
    if (!puedoReclamarAreaEscritorio(input.area, input.usuarioId)) {
      // Resolvemos el motivo de bloqueo desde la entity para que la UI
      // muestre el mensaje correcto sin tener que adivinar.
      if (input.area.reclamado_por_usuario_id === input.usuarioId) {
        // Idempotencia: ya es mío, devuelvo OK sin tocar.
        return { ok: true, area: input.area };
      }
      if (input.area.reclamado_por_usuario_id !== null) {
        return { ok: false, motivo: 'ya_reclamada' };
      }
      if (input.area.asignado_a_usuario_id !== null
        && input.area.asignado_a_usuario_id !== input.usuarioId) {
        return { ok: false, motivo: 'pre_asignada_a_otro' };
      }
      return { ok: false, motivo: 'no_autorizado' };
    }

    return this.repo.reclamar(input.area.id);
  }
}
