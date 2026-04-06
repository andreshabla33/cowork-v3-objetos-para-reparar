/**
 * @module application/usecases/EnviarMensajeChatUseCase
 * @description Use case for sending a chat message.
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type {
  MensajeChatData,
  DatosCrearMensaje,
  IChatRepository,
} from '../../domain/ports/IChatRepository';

/**
 * Input DTO for sending a message.
 */
export interface DatosEnviarMensaje {
  grupoId: string;
  usuarioId: string;
  contenido: string;
  tipo?: 'texto' | 'imagen' | 'archivo' | 'sistema';
  menciones?: string[] | null;
  respuestaA?: string | null;
}

export class EnviarMensajeChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Send a message to a channel.
   * Never throws — returns null on failure.
   *
   * @param datos Message data to send
   * @returns Created message with nested user data, or null on failure
   */
  async ejecutar(datos: DatosEnviarMensaje): Promise<MensajeChatData | null> {
    const datosCrear: DatosCrearMensaje = {
      grupo_id: datos.grupoId,
      usuario_id: datos.usuarioId,
      contenido: datos.contenido,
      tipo: datos.tipo || 'texto',
      menciones: datos.menciones,
      respuesta_a: datos.respuestaA,
    };

    return this.chatRepository.enviarMensaje(datosCrear);
  }
}
