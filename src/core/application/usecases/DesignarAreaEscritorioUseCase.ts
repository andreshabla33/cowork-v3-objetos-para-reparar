/**
 * @module application/usecases/DesignarAreaEscritorioUseCase
 *
 * Admin-only: crea un nuevo `AreaEscritorio` en el espacio. Recibe el bbox
 * en world coords + nombre + flag de audio aislado. El server-side valida
 * que el caller es admin del espacio.
 */

import {
  crearBboxAreaEscritorio,
  type BboxAreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export interface DesignarAreaEscritorioInput {
  espacioId: string;
  /**
   * Bbox raw que viene de la herramienta admin (drag-to-create). El factory
   * `crearBboxAreaEscritorio` normaliza tipos y valida invariantes.
   */
  bbox: BboxAreaEscritorio | {
    centroX: number | string;
    centroZ: number | string;
    ancho: number | string;
    alto: number | string;
  };
  nombre: string;
  audioAislado?: boolean;
}

export class DesignarAreaEscritorioUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(input: DesignarAreaEscritorioInput): Promise<ResultadoMutacionAreaEscritorio> {
    const nombreLimpio = input.nombre.trim();
    if (nombreLimpio.length === 0) {
      // Pre-check de nombre vacío (mismo gate que el server, pero acá
      // ahorramos round-trip y damos feedback inmediato al admin).
      return { ok: false, motivo: 'error' };
    }

    let bbox: BboxAreaEscritorio;
    try {
      bbox = crearBboxAreaEscritorio(input.bbox);
    } catch {
      return { ok: false, motivo: 'error' };
    }

    return this.repo.designar({
      espacioId: input.espacioId,
      bbox,
      nombre: nombreLimpio,
      audioAislado: input.audioAislado ?? false,
    });
  }
}
