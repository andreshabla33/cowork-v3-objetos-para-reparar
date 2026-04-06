/**
 * @module application/usecases/GestionarChatDirectoUseCase
 * @description Use case for finding or creating direct message channels.
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type { ChatGroup } from '@/types';
import type { IChatRepository } from '../../domain/ports/IChatRepository';

/**
 * Result DTO for finding or creating a DM channel.
 */
export interface ResultadoObtenerChatDirecto {
  grupoId: string;
  nombre: string;
  tipo: 'directo';
  espacio_id: string;
}

export class GestionarChatDirectoUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Find or create a direct message channel between two users.
   * In a real implementation, this would search for an existing DM group
   * or create a new one if it doesn't exist.
   *
   * This is a placeholder use case that demonstrates how to handle
   * DM logic. The actual implementation would depend on how your
   * DM channels are organized (could be a specific naming convention,
   * a flag in grupos_chat, etc.).
   *
   * @param espacioId Workspace ID
   * @param usuarioActualId Current user ID
   * @param usuarioTargetId Target user ID for DM
   * @returns DM channel info
   */
  async ejecutar(
    espacioId: string,
    usuarioActualId: string,
    usuarioTargetId: string
  ): Promise<ResultadoObtenerChatDirecto | null> {
    // Load all groups to find an existing DM
    const grupos = await this.chatRepository.obtenerGrupos(espacioId);

    // Look for a directo type group between these two users
    // (This assumes a naming convention or metadata that identifies
    // DM channels between specific users)
    const chatDirecto = grupos.find(
      (g) => g.tipo === 'directo' &&
            (g.creado_por === usuarioActualId || g.creado_por === usuarioTargetId)
    );

    if (chatDirecto) {
      return {
        grupoId: chatDirecto.id,
        nombre: chatDirecto.nombre,
        tipo: 'directo',
        espacio_id: chatDirecto.espacio_id,
      };
    }

    // If no existing DM found, create one
    const nombreDM = [usuarioActualId, usuarioTargetId].sort().join('-');

    const nuevoGrupo = await this.chatRepository.crearGrupo({
      espacio_id: espacioId,
      nombre: nombreDM,
      tipo: 'directo',
      creado_por: usuarioActualId,
      icono: '💬',
    });

    if (!nuevoGrupo) {
      return null;
    }

    // Add both users to the DM group
    await this.chatRepository.agregarMiembroCanal(
      nuevoGrupo.id,
      usuarioActualId,
      'miembro'
    );
    await this.chatRepository.agregarMiembroCanal(
      nuevoGrupo.id,
      usuarioTargetId,
      'miembro'
    );

    return {
      grupoId: nuevoGrupo.id,
      nombre: nuevoGrupo.nombre,
      tipo: 'directo',
      espacio_id: nuevoGrupo.espacio_id,
    };
  }
}
