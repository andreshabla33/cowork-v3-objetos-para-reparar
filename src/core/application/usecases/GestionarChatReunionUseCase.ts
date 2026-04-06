/**
 * @module application/usecases/GestionarChatReunionUseCase
 * @description Use case for managing meeting chat lifecycle.
 * Handles group init, message history, message persistence, and realtime subscriptions.
 */
import { logger } from '@/lib/logger';
import type {
  IChatRepository,
  MensajeChatRecord,
  InsertarMensajeChatData,
  OnNuevoMensajeCallback,
  NombreUsuario,
} from '@/src/core/domain/ports/IChatRepository';

const log = logger.child('gestionar-chat-reunion-uc');

export class GestionarChatReunionUseCase {
  constructor(private readonly repo: IChatRepository) {}

  /** Initialize or retrieve chat group for a meeting room */
  async inicializarGrupo(
    salaId: string,
    espacioId: string,
    nombre: string
  ): Promise<string> {
    log.info('Initializing meeting chat group', { salaId, espacioId });
    return this.repo.obtenerOCrearGrupoChatReunion(salaId, espacioId, nombre);
  }

  /** Load chat message history */
  async cargarHistorial(
    grupoId: string,
    limit: number = 200
  ): Promise<MensajeChatRecord[]> {
    log.debug('Loading chat history', { grupoId, limit });
    return this.repo.obtenerHistorialMensajes(grupoId, limit);
  }

  /** Persist a single message */
  async enviarMensaje(data: InsertarMensajeChatData): Promise<void> {
    log.debug('Persisting message', { grupoId: data.grupo_id });
    await this.repo.insertarMensaje(data);
  }

  /** Subscribe to new messages in realtime. Returns unsubscribe function. */
  async suscribir(
    grupoId: string,
    onNuevoMensaje: OnNuevoMensajeCallback
  ): Promise<() => void> {
    log.info('Subscribing to chat messages', { grupoId });
    return this.repo.suscribirMensajesNuevos(grupoId, onNuevoMensaje);
  }

  /** Resolve sender name by user ID */
  async resolverNombreUsuario(userId: string): Promise<NombreUsuario | null> {
    return this.repo.obtenerNombreUsuario(userId);
  }

  /** Check if a user is a valid participant in the sala */
  async resolverParticipante(
    salaId: string,
    userId: string
  ): Promise<string | null> {
    return this.repo.resolverUsuarioParticipante(salaId, userId);
  }
}
