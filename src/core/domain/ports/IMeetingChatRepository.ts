/**
 * @module domain/ports/IMeetingChatRepository
 * @description Port para el chat legado de salas de reunión (meeting room).
 *
 * Sub-port de `IChatRepository` (split 2026-05-09, ITEM 17 fase B).
 * Cubre el flow de chat dentro de una sala — incluye suscripciones realtime
 * a `mensajes_chat`, lookup de usuario y validación de participación en sala.
 *
 * Clean Architecture: Domain layer define el contrato; Infrastructure
 * (Supabase) provee la implementación concreta.
 *
 * Marcado como "legacy" en el JSDoc original: el flow nuevo (Space chat)
 * está en `ISpaceChatRepository` y reemplaza este path en producción
 * progresivamente.
 */

import type {
  MensajeChatRecord,
  InsertarMensajeChatData,
  NombreUsuario,
  OnNuevoMensajeCallback,
} from './IChatRepository';

export interface IMeetingChatRepository {
  /**
   * Get or create a chat group for a meeting room.
   */
  obtenerOCrearGrupoChatReunion(
    salaId: string,
    espacioId: string,
    nombre: string,
  ): Promise<string>;

  /**
   * Load chat message history for a group (meeting room pagination).
   */
  obtenerHistorialMensajes(grupoId: string, limit: number): Promise<MensajeChatRecord[]>;

  /**
   * Insert a single chat message (meeting room).
   */
  insertarMensaje(data: InsertarMensajeChatData): Promise<void>;

  /**
   * Subscribe to new messages in a group via realtime.
   * Returns an unsubscribe function.
   */
  suscribirMensajesNuevos(
    grupoId: string,
    onNuevoMensaje: OnNuevoMensajeCallback,
  ): Promise<() => void>;

  /**
   * Lookup user name information by user ID.
   */
  obtenerNombreUsuario(userId: string): Promise<NombreUsuario | null>;

  /**
   * Validate that a user is an authorized participant in a sala.
   */
  resolverUsuarioParticipante(salaId: string, userId: string): Promise<string | null>;
}
