/**
 * @module application/usecases/AsignarAreaEscritorioUseCase
 *
 * Admin-only: pre-asigna (o quita pre-asignación con `usuarioId=null`) un
 * `AreaEscritorio` a un miembro. NO reclama por el miembro — solo reserva
 * el slot. Soporta también el modo "reasignar" (libera reclamación previa)
 * via el parámetro `forzarReasignacion`.
 */

import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface AsignarAreaEscritorioInput {
  areaId: string;
  /** Usuario receptor de la asignación. `null` = quitar pre-asignación. */
  usuarioId: string | null;
  /**
   * Si `true`, libera la reclamación actual (si existe) antes de aplicar la
   * nueva asignación. Útil para mover un desk de un miembro a otro sin que
   * el admin tenga que pedir manualmente al ocupante actual que libere.
   */
  forzarReasignacion?: boolean;
}

export class AsignarAreaEscritorioUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: AsignarAreaEscritorioInput): Promise<ResultadoMutacionAreaEscritorio> {
    if (input.forzarReasignacion) {
      return this.repo.reasignar(input.areaId, input.usuarioId);
    }
    return this.repo.asignar(input.areaId, input.usuarioId);
  }
}
