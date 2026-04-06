/**
 * @module application/usecases/CargarHiloMensajeUseCase
 * @description Use case for loading a message thread (parent + all replies).
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type { MensajeChatData, IChatRepository } from '../../domain/ports/IChatRepository';

export class CargarHiloMensajeUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Load a thread: the root message and all replies.
   * Never throws — returns empty array on failure.
   *
   * @param mensajeId Root message ID
   * @returns Messages in the thread, ordered by creation date
   */
  async ejecutar(mensajeId: string): Promise<MensajeChatData[]> {
    return this.chatRepository.obtenerHilo(mensajeId);
  }
}
