/**
 * @module application/usecases/ToggleAudioAisladoUseCase
 *
 * Alterna el flag `audio_aislado` de un AreaEscritorio. Lo invoca el botón
 * "candado" del ControlBar cuando el usuario está dentro de un desk + en
 * proximity stream. Cualquier participante del desk puede ejecutarlo
 * (decisión social entre los presentes).
 */

import type {
  IAreaEscritorioRepository,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

export class ToggleAudioAisladoUseCase {
  constructor(private readonly repo: IAreaEscritorioRepository) {}

  async execute(areaId: string): Promise<ResultadoMutacionAreaEscritorio> {
    return this.repo.toggleAudioAislado(areaId);
  }
}
