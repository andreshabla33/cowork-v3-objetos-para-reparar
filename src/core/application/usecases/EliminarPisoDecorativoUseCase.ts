/**
 * @module application/usecases/EliminarPisoDecorativoUseCase
 *
 * Elimina un piso decorativo por id. Auth admin validada en la RPC.
 */

import type { IPisoDecorativoRepository } from '@/core/domain/ports/IPisoDecorativoRepository';

export class EliminarPisoDecorativoUseCase {
  constructor(private readonly repo: IPisoDecorativoRepository) {}

  async execute(pisoId: string): Promise<{ ok: boolean; motivo?: string }> {
    if (!pisoId) return { ok: false, motivo: 'id_vacio' };
    return this.repo.eliminar(pisoId);
  }
}
