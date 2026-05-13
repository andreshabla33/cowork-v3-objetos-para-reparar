/**
 * @module application/usecases/ActualizarSueloPrincipalUseCase
 *
 * Cambia el `tipoSueloPrincipal` del espacio sin tocar las demás propiedades
 * del terreno (montañas, ríos, heightmap). Si el espacio aún no tiene
 * `espacio_terreno`, crea uno con defaults.
 *
 * Clean Architecture: Application layer — orquesta `ITerrenoRepository`.
 * Sin React, sin Three.js, sin Supabase directo.
 */

import type { ITerrenoRepository } from '../../domain/ports/ITerrenoRepository';
import {
  TERRENO_FLAT_DEFAULT,
  validarTerreno,
  type TerrenoEntity,
} from '../../domain/entities/espacio3d/TerrenoEntity';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('actualizar-suelo-principal');

export interface ActualizarSueloPrincipalInput {
  espacioId: string;
  tipoSueloPrincipal: string;
}

export class ActualizarSueloPrincipalUseCase {
  constructor(private readonly repo: ITerrenoRepository) {}

  async ejecutar(input: ActualizarSueloPrincipalInput): Promise<TerrenoEntity> {
    const { espacioId, tipoSueloPrincipal } = input;

    // Lee el terreno actual o aplica defaults si no existe.
    const actual = await this.repo.obtener(espacioId);
    const base: Omit<TerrenoEntity, 'id'> = actual
      ? { ...actual, tipoSueloPrincipal }
      : { espacioId, ...TERRENO_FLAT_DEFAULT, tipoSueloPrincipal };

    const errores = validarTerreno(base);
    if (errores.length > 0) {
      log.warn('Validación falló', { espacioId, errores });
      throw new Error(`Terreno inválido: ${errores.join('; ')}`);
    }

    log.info('Actualizando suelo principal', {
      espacioId,
      tipoSueloPrincipal,
      tenia_terreno_previo: !!actual,
    });

    return this.repo.guardar(base);
  }
}
