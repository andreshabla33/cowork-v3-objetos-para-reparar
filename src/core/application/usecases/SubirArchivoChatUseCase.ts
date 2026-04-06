/**
 * @module application/usecases/SubirArchivoChatUseCase
 * @description Use case for uploading files to chat and sending file messages.
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type { MensajeChatData, IChatRepository } from '../../domain/ports/IChatRepository';

/**
 * Input DTO for uploading and sending a file.
 */
export interface DatosEnviarArchivo {
  grupoId: string;
  usuarioId: string;
  archivo: File;
  espacioId: string;
}

/**
 * Result DTO for file upload operation.
 */
export interface ResultadoEnviarArchivo {
  mensajeId: string;
  contenido: string; // Public URL
  tipo: 'archivo';
}

export class SubirArchivoChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Upload a file to chat storage and send a file message.
   * The file message's contenido field contains the public URL.
   * Never throws — returns null on failure.
   *
   * @param datos File data and message metadata
   * @returns Uploaded file message info or null on failure
   */
  async ejecutar(datos: DatosEnviarArchivo): Promise<ResultadoEnviarArchivo | null> {
    // Step 1: Upload file to storage
    const publicUrl = await this.chatRepository.subirArchivo(
      datos.espacioId,
      datos.archivo
    );

    if (!publicUrl) {
      return null;
    }

    // Step 2: Send a file message with the URL as content
    const mensajeCreado = await this.chatRepository.enviarMensaje({
      grupo_id: datos.grupoId,
      usuario_id: datos.usuarioId,
      contenido: publicUrl,
      tipo: 'archivo',
    });

    if (!mensajeCreado) {
      return null;
    }

    return {
      mensajeId: mensajeCreado.id,
      contenido: publicUrl,
      tipo: 'archivo',
    };
  }
}
