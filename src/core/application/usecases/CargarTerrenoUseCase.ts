/**
 * @module application/usecases/CargarTerrenoUseCase
 * @description Carga la configuración de terreno (suelo + montañas + ríos)
 * de un espacio. Si no existe row aplica `TERRENO_FLAT_DEFAULT` como fallback.
 *
 * Clean Architecture: Application layer — NO importa React, Three.js, Rapier
 * ni Supabase directamente; consume `ITerrenoRepository`.
 */

import type { ITerrenoRepository } from '../../domain/ports/ITerrenoRepository';
import {
  TERRENO_FLAT_DEFAULT,
  type TerrenoEntity,
} from '../../domain/entities/espacio3d/TerrenoEntity';
import { logger } from '../../../../lib/logger';

const log = logger.child('cargar-terreno');

export interface CargarTerrenoInput {
  espacioId: string;
}

export class CargarTerrenoUseCase {
  constructor(private readonly repo: ITerrenoRepository) {}

  /**
   * Retorna el terreno del espacio o un default `flat` si aún no existe.
   * Nunca lanza por "no encontrado" — solo por errores reales de infra.
   */
  async ejecutar(input: CargarTerrenoInput): Promise<TerrenoEntity> {
    const existente = await this.repo.obtener(input.espacioId);
    if (existente) return existente;

    log.info('Sin terreno persistido — aplicando default flat', {
      espacioId: input.espacioId,
    });

    return {
      id: '',
      espacioId: input.espacioId,
      ...TERRENO_FLAT_DEFAULT,
    };
  }
}
