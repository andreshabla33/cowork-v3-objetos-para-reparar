/**
 * @module application/usecases/GuardarTerrenoUseCase
 * @description Persiste la configuración de terreno (suelo + montañas + ríos)
 * de un espacio. Valida la entidad antes de tocar la infraestructura.
 *
 * Clean Architecture: Application layer — NO importa React, Three.js, Rapier
 * ni Supabase directamente; consume `ITerrenoRepository`.
 */

import type { ITerrenoRepository } from '../../domain/ports/ITerrenoRepository';
import {
  validarTerreno,
  type TerrenoEntity,
} from '../../domain/entities/espacio3d/TerrenoEntity';
import { logger } from '../../../../lib/logger';

const log = logger.child('guardar-terreno');

export type GuardarTerrenoInput = Omit<TerrenoEntity, 'id'>;

export class TerrenoInvalidoError extends Error {
  constructor(public readonly errores: string[]) {
    super(`Terreno inválido: ${errores.join('; ')}`);
    this.name = 'TerrenoInvalidoError';
  }
}

export class GuardarTerrenoUseCase {
  constructor(private readonly repo: ITerrenoRepository) {}

  async ejecutar(input: GuardarTerrenoInput): Promise<TerrenoEntity> {
    const errores = validarTerreno(input);
    if (errores.length > 0) {
      log.warn('Validación falló', { espacioId: input.espacioId, errores });
      throw new TerrenoInvalidoError(errores);
    }

    log.info('Guardando terreno', {
      espacioId: input.espacioId,
      tipo: input.tipo,
      zonasAgua: input.zonasAgua.length,
    });

    return this.repo.guardar(input);
  }
}
