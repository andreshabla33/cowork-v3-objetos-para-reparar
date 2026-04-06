/**
 * @module application/usecases/CargarGruposChatUseCase
 * @description Use case for loading chat groups in a workspace.
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic
 * through repository port, no direct infrastructure dependency.
 */

import type { ChatGroup } from '@/types';
import type { IChatRepository } from '../../domain/ports/IChatRepository';

export class CargarGruposChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Load all groups in a workspace.
   * Returns empty array on failure (never throws).
   *
   * @param espacioId Workspace ID
   * @returns List of chat groups, ordered by creation date
   */
  async ejecutar(espacioId: string): Promise<ChatGroup[]> {
    return this.chatRepository.obtenerGrupos(espacioId);
  }
}
