/**
 * @module application/usecases/LiberarAreaEscritorioUseCase
 *
 * Use case que libera el AreaEscritorio del usuario actual. Solo el dueño
 * puede liberar — el server-side gate via auth.uid() es la fuente
 * autoritativa, el Domain hace pre-check para feedback inmediato.
 */

import {
  puedoLiberarAreaEscritorio,
  type AreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface LiberarAreaEscritorioInput {
  area: AreaEscritorio;
  usuarioId: string;
}

export class LiberarAreaEscritorioUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: LiberarAreaEscritorioInput): Promise<ResultadoMutacionAreaEscritorio> {
    if (!puedoLiberarAreaEscritorio(input.area, input.usuarioId)) {
      // Si no soy el dueño (o no hay reclamación), no puedo liberar.
      if (input.area.reclamado_por_usuario_id === null) {
        // Ya está libre — idempotencia.
        return { ok: true, area: input.area };
      }
      return { ok: false, motivo: 'no_es_mi_area' };
    }
    return this.repo.liberar(input.area.id);
  }
}
