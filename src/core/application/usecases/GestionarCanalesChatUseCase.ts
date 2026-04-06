/**
 * @module application/usecases/GestionarCanalesChatUseCase
 * @description Use case for managing chat channels (create, delete, manage members).
 * Delegates to IChatRepository port, keeping business rules in application layer.
 *
 * Clean Architecture: Application layer — orchestrates domain logic.
 */

import type { ChatGroup } from '@/types';
import type {
  DatosCrearGrupo,
  MiembroCanal,
  MiembroChatData,
  IChatRepository,
} from '../../domain/ports/IChatRepository';

/**
 * Input DTO for creating a channel.
 */
export interface DatosCrearCanal {
  espacioId: string;
  nombre: string;
  tipo: 'publico' | 'privado' | 'directo';
  creadoPor: string;
  icono: string;
  contrasena?: string | null;
  descripcion?: string | null;
}

export class GestionarCanalesChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Create a new channel.
   * Never throws — returns null on failure.
   *
   * @param datos Channel creation data
   * @returns Created channel or null on failure
   */
  async crearCanal(datos: DatosCrearCanal): Promise<ChatGroup | null> {
    const datosCrear: DatosCrearGrupo = {
      espacio_id: datos.espacioId,
      nombre: datos.nombre,
      tipo: datos.tipo,
      creado_por: datos.creadoPor,
      icono: datos.icono,
      contrasena: datos.contrasena,
      descripcion: datos.descripcion,
    };

    return this.chatRepository.crearGrupo(datosCrear);
  }

  /**
   * Delete a channel and its associated data.
   * This is a cascading operation: deletes members and messages too.
   * Never throws — returns false on failure.
   *
   * @param grupoId Channel ID
   * @returns true if successful, false otherwise
   */
  async eliminarCanal(grupoId: string): Promise<boolean> {
    // Delete members first (cleanup)
    await this.chatRepository.eliminarMiembrosGrupo(grupoId);

    // Delete messages (cleanup)
    await this.chatRepository.eliminarMensajesGrupo(grupoId);

    // Finally delete the channel
    return this.chatRepository.eliminarGrupo(grupoId);
  }

  /**
   * Get all members of a channel.
   * Never throws — returns empty array on failure.
   *
   * @param grupoId Channel ID
   * @returns List of channel members with roles
   */
  async obtenerMiembrosCanal(grupoId: string): Promise<MiembroCanal[]> {
    return this.chatRepository.obtenerMiembrosCanal(grupoId);
  }

  /**
   * Add a member to a channel.
   * Never throws — silently handles failures.
   *
   * @param grupoId Channel ID
   * @param usuarioId User ID
   * @param rol Role in channel (e.g., 'miembro', 'moderador')
   */
  async agregarMiembroCanal(
    grupoId: string,
    usuarioId: string,
    rol: string = 'miembro'
  ): Promise<void> {
    return this.chatRepository.agregarMiembroCanal(grupoId, usuarioId, rol);
  }

  /**
   * Get space members (for adding to channels).
   * Excludes the current user.
   * Never throws — returns empty array on failure.
   *
   * @param espacioId Workspace ID
   * @param usuarioActualId Current user ID
   * @returns List of available members to add to channels
   */
  async obtenerMiembrosEspacioDisponibles(
    espacioId: string,
    usuarioActualId: string
  ): Promise<MiembroChatData[]> {
    return this.chatRepository.obtenerMiembrosEspacio(
      espacioId,
      usuarioActualId
    );
  }
}
