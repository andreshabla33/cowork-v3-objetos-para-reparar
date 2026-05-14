/**
 * @module application/usecases/CrearPisoDecorativoUseCase
 *
 * Crea un piso decorativo (alfombra/parche) en el espacio. Valida bbox y
 * normaliza el `tipoSuelo` antes de llegar al repositorio.
 *
 * Clean Architecture: depende sólo del port `IPisoDecorativoRepository`.
 * La autorización admin se valida server-side por la RPC.
 */

import type {
  CrearPisoDecorativoInput,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';
import { normalizarTipoSuelo } from '@/core/domain/entities/tiposSuelo';
import type {
  IPisoDecorativoRepository,
  ResultadoMutacionPisoDecorativo,
} from '@/core/domain/ports/IPisoDecorativoRepository';

export class CrearPisoDecorativoUseCase {
  constructor(private readonly repo: IPisoDecorativoRepository) {}

  async execute(input: CrearPisoDecorativoInput): Promise<ResultadoMutacionPisoDecorativo> {
    if (input.ancho <= 0 || input.profundidad <= 0) {
      return { ok: false, motivo: 'bbox_invalido' };
    }

    return this.repo.crear({
      espacioId: input.espacioId,
      zonaId: input.zonaId,
      tipoSuelo: normalizarTipoSuelo(input.tipoSuelo),
      centroX: input.centroX,
      centroZ: input.centroZ,
      ancho: input.ancho,
      profundidad: input.profundidad,
      rotacionY: input.rotacionY ?? 0,
      orden: input.orden ?? 0,
    });
  }
}
