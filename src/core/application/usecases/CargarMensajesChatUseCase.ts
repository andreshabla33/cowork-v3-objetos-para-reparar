/**
 * @module application/usecases/CargarMensajesChatUseCase
 * @description Use case for loading messages in a channel and counting replies.
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type { MensajeChatData } from '../../domain/ports/IChatRepository';
import type { IChatRepository } from '../../domain/ports/IChatRepository';

/**
 * Result DTO for message loading operation.
 */
export interface ResultadoCargarMensajes {
  mensajes: MensajeChatData[];
  conteoReplicas: Record<string, number>;
}

export class CargarMensajesChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Load messages for a channel and count replies for each message.
   * Never throws — returns empty data on failure.
   *
   * @param grupoId Channel ID
   * @returns Messages and reply counts
   */
  async ejecutar(grupoId: string): Promise<ResultadoCargarMensajes> {
    const mensajes = await this.chatRepository.obtenerMensajes(grupoId);

    // Extract message IDs that have replies
    const messageIds = mensajes.map((m) => m.id);
    const conteoReplicas = await this.chatRepository.contarRespuestas(
      messageIds
    );

    return {
      mensajes,
      conteoReplicas,
    };
  }
}
