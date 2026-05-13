/**
 * @module application/usecases/GenerarOficinaTemplateUseCase
 *
 * Orquesta el onboarding "N miembros → grid de N desks". Compone el Domain
 * (PresetDesk + OficinaTemplatePolicy) con el use case de colocación.
 *
 * Atómicidad: actualmente N RPCs separadas (una por desk). Cada una es
 * atómica por sí misma. Si falla una en el medio, las anteriores quedan
 * creadas — el admin podrá ver el estado parcial y reintentar el wizard
 * (los desks ya creados se respetan).
 *
 * Decisión 2026-05-13: no envolver las N RPCs en una sola transacción del
 * cliente. La sobrecarga de mantener una transacción server-side larga
 * (que tendría que serializar inserts en `espacio_objetos`) no compensa
 * contra el riesgo de timeout en redes lentas con N=100.
 */

import type { PresetDesk } from '@/src/core/domain/entities/espacio3d/PresetDesk';
import {
  generarPosicionesGridDesks,
  normalizarCantidadMiembros,
  SEPARACION_DESKS_DEFAULT,
  type GridBounds,
} from '@/src/core/domain/entities/espacio3d/OficinaTemplatePolicy';
import type { AreaEscritorio } from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import { ColocarDeskConPresetUseCase } from './ColocarDeskConPresetUseCase';
import type { IAreaEscritorioRepository } from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface GenerarOficinaTemplateInput {
  espacioId: string;
  preset: PresetDesk;
  cantidadMiembros: number;
  /** Centro de la grilla (m). Default `{x:0, z:0}` = centro del world. */
  centro?: { x: number; z: number };
  /** Separación entre desks (m). Default 1.5m. */
  separacion?: number;
  /** Si todos los desks deben crearse con audio_aislado=true (default). */
  audioAisladoDefault?: boolean;
  /** Prefijo para el nombre de cada desk. Default "Desk". */
  prefijoNombre?: string;
}

export interface GenerarOficinaTemplateResult {
  /** Areas creadas exitosamente (en orden de la grilla). */
  desks: AreaEscritorio[];
  /** Cantidad solicitada original (clampeada por el Domain). */
  cantidadProcesada: number;
  /** Falla parcial — N desks creados antes del primer error. */
  errores: Array<{ indice: number; motivo: string }>;
}

export class GenerarOficinaTemplateUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: GenerarOficinaTemplateInput): Promise<GenerarOficinaTemplateResult> {
    const cantidad = normalizarCantidadMiembros(input.cantidadMiembros);
    const centro = input.centro ?? { x: 0, z: 0 };
    const separacion = input.separacion ?? SEPARACION_DESKS_DEFAULT;
    const audioAislado = input.audioAisladoDefault ?? true;
    const prefijoNombre = (input.prefijoNombre ?? 'Desk').trim() || 'Desk';

    const bounds: GridBounds = {
      centroX: centro.x,
      centroZ: centro.z,
      separacion,
    };

    const posiciones = generarPosicionesGridDesks({
      cantidad,
      preset: input.preset,
      bounds,
    });

    const colocarUC = new ColocarDeskConPresetUseCase(this.repo);
    const desks: AreaEscritorio[] = [];
    const errores: Array<{ indice: number; motivo: string }> = [];

    // Secuencial (no paralelo) para evitar contención sobre `espacio_objetos`.
    // Para N=100, el cost ~100 × ~80ms = ~8s en buena red. Aceptable para
    // un wizard one-shot del onboarding.
    for (const pos of posiciones) {
      const resultado = await colocarUC.execute({
        espacioId: input.espacioId,
        preset: input.preset,
        posicion: { x: pos.x, z: pos.z },
        nombre: `${prefijoNombre} #${pos.indice + 1}`,
        asignadoAUsuarioId: null, // sin pre-asignación
        audioAislado,
      });
      if (resultado.ok) {
        desks.push(resultado.area);
      } else {
        errores.push({ indice: pos.indice, motivo: resultado.motivo });
      }
    }

    return { desks, cantidadProcesada: cantidad, errores };
  }
}
