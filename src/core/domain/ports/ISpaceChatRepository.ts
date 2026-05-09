/**
 * @module domain/ports/ISpaceChatRepository
 * @description Port para el chat de espacio (workspace channels + DMs + files).
 *
 * Sub-port de `IChatRepository` (split 2026-05-09, ITEM 17 fase B).
 * Cubre el flow Space chat: canales, mensajes ricos (con archivos, hilos,
 * menciones), DMs, miembros del espacio + canal, y file uploads a Storage.
 *
 * Clean Architecture: Domain layer define el contrato; Infrastructure
 * (Supabase) provee la implementación concreta.
 */

import type { ChatGroup } from '@/types';
import type {
  MensajeChatData,
  DatosCrearMensaje,
  DatosCrearGrupo,
  MiembroCanal,
  MiembroChatData,
} from './IChatRepository';

export interface ISpaceChatRepository {
  /** Get all chat groups/channels for a workspace. */
  obtenerGrupos(espacioId: string): Promise<ChatGroup[]>;

  /** Get metadata for a single group (nombre, tipo). */
  obtenerInfoGrupo(grupoId: string): Promise<{ nombre: string; tipo: string } | null>;

  /** Create a new chat group/channel. Returns null on failure. */
  crearGrupo(datos: DatosCrearGrupo): Promise<ChatGroup | null>;

  /** Delete a chat group. Returns true on success, false on failure. */
  eliminarGrupo(grupoId: string): Promise<boolean>;

  /** Delete all members of a group (cleanup before eliminarGrupo). */
  eliminarMiembrosGrupo(grupoId: string): Promise<void>;

  /** Delete all messages in a group (cleanup before eliminarGrupo). */
  eliminarMensajesGrupo(grupoId: string): Promise<void>;

  /** Get members of a channel with their roles. */
  obtenerMiembrosCanal(grupoId: string): Promise<MiembroCanal[]>;

  /** Add a user to a channel with the given role. */
  agregarMiembroCanal(grupoId: string, usuarioId: string, rol: string): Promise<void>;

  /**
   * Add multiple members to a channel in a single batch insert.
   * All items share the same role.
   */
  agregarMiembrosCanal(grupoId: string, usuarioIds: string[], rol: string): Promise<void>;

  /**
   * Add multiple members to a DM group atomically via RPC `agregar_miembros_dm`.
   * Uses SECURITY DEFINER to bypass RLS upsert limitations.
   */
  agregarMiembrosDM(grupoId: string, usuarioIds: string[]): Promise<void>;

  /**
   * Get space members available to add to channels.
   * Excludes the current user.
   */
  obtenerMiembrosEspacio(espacioId: string, usuarioActualId: string): Promise<MiembroChatData[]>;

  /** Load messages for a channel, ordered ascending by creado_en. */
  obtenerMensajes(grupoId: string): Promise<MensajeChatData[]>;

  /** Load a message thread: root message + all replies, ordered ascending. */
  obtenerHilo(mensajeId: string): Promise<MensajeChatData[]>;

  /**
   * Send a message to a channel. Returns created message or null on failure.
   */
  enviarMensaje(datos: DatosCrearMensaje): Promise<MensajeChatData | null>;

  /**
   * Find or create a 1:1 direct chat group between two users in a workspace.
   * Returns the group_id of the direct chat, or null if creation failed.
   */
  obtenerOCrearChatDirecto(userA: string, userB: string, espacioId: string): Promise<string | null>;

  /** Count replies for each message ID. Returns map messageId → replyCount. */
  contarRespuestas(messageIds: string[]): Promise<Record<string, number>>;

  /** Upload a file to chat storage. Returns public URL on success, null on failure. */
  subirArchivo(espacioId: string, archivo: File): Promise<string | null>;
}
