/**
 * @module application/usecases/ColocarDeskConPresetUseCase
 *
 * Use case del flow click-to-place admin: dado un `PresetDesk` + una posición
 * world (centro del desk), crea atómicamente el AreaEscritorio + los N
 * muebles del preset. Reemplaza al flow legacy "drag rectangle → solo el
 * área (sin muebles)".
 *
 * Clean Architecture: depende sólo del port. La transacción atómica vive
 * en la RPC `colocar_desk_con_preset` (Infrastructure).
 */

import type { PresetDesk } from '@/src/core/domain/entities/espacio3d/PresetDesk';
import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface ColocarDeskConPresetInput {
  espacioId: string;
  preset: PresetDesk;
  /** Centro del desk en world coords (m). */
  posicion: { x: number; z: number };
  /** Nombre legible del desk. */
  nombre: string;
  /** `null` = sin pre-asignación (cualquiera puede reclamar). */
  asignadoAUsuarioId: string | null;
  /** Default `true` (Private Area por default, alineado con Gather). */
  audioAislado?: boolean;
}

export class ColocarDeskConPresetUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: ColocarDeskConPresetInput): Promise<ResultadoMutacionAreaEscritorio> {
    const nombreLimpio = input.nombre.trim();
    if (nombreLimpio.length === 0) {
      return { ok: false, motivo: 'error' };
    }

    return this.repo.colocarConPreset({
      espacioId: input.espacioId,
      bbox: {
        centroX: input.posicion.x,
        centroZ: input.posicion.z,
        ancho: input.preset.bbox.ancho,
        alto: input.preset.bbox.alto,
      },
      nombre: nombreLimpio,
      audioAislado: input.audioAislado ?? true,
      asignadoAUsuarioId: input.asignadoAUsuarioId,
      muebles: input.preset.muebles.map((m) => ({
        slug: m.slugCatalogo,
        offsetX: m.offsetX,
        offsetZ: m.offsetZ,
        rotacionY: m.rotacionY,
        rol: m.rol,
      })),
    });
  }
}
