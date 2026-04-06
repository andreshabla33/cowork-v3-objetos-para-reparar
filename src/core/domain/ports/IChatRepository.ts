/**
 * @module domain/ports/IChatRepository
 * @description Port interface for all chat operations: space channels, DMs, and meeting chat.
 * Decouples chat persistence from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — realtime channels, PostgREST API.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 *
 * CHATFIX-001 (2026-03-30): Extendida con tipos y métodos de chat de espacio
 * que los use cases ya esperaban pero no estaban definidos en el port.
 */

import type { ChatGroup } from '@/types';

// ─── Tipos compartidos ────────────────────────────────────────────────────────

/**
 * Chat message record from 'mensajes_chat' table (meeting room chat).
 */
export interface MensajeChatRecord {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  contenido: string;
  tipo: string;
  creado_en: string;
  usuario?: {
    nombre: string | null;
    apellido: string | null;
  } | null;
}

/**
 * Rich message data for space chat (includes file URL, replies, mentions).
 * Maps to mensajes_chat with usuarios join.
 */
export interface MensajeChatData {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  contenido: string;
  tipo: 'texto' | 'imagen' | 'archivo' | 'sistema';
  archivo_url?: string | null;
  respuesta_a?: string | null;
  menciones?: string[] | null;
  respuestas_count?: number;
  creado_en: string;
  editado?: boolean;
  editado_en?: string | null;
  usuario?: {
    id?: string;
    nombre: string | null;
    apellido?: string | null;
    avatar_url?: string | null;
  } | null;
}

/**
 * Data payload for inserting a new chat message.
 * Used by meeting room chat (legacy).
 */
export interface InsertarMensajeChatData {
  grupo_id: string;
  usuario_id: string;
  contenido: string;
  tipo: 'texto';
}

/**
 * Data payload for creating a rich message (space chat).
 */
export interface DatosCrearMensaje {
  grupo_id: string;
  usuario_id: string;
  contenido: string;
  tipo: 'texto' | 'imagen' | 'archivo' | 'sistema';
  menciones?: string[] | null;
  respuesta_a?: string | null;
}

/**
 * Data payload for creating a new chat group/channel.
 */
export interface DatosCrearGrupo {
  espacio_id: string;
  nombre: string;
  tipo: 'publico' | 'privado' | 'directo';
  creado_por: string;
  icono: string;
  contrasena?: string | null;
  descripcion?: string | null;
}

/**
 * Member of a chat channel with their role.
 * Maps to miembros_grupo table with usuarios join.
 */
export interface MiembroCanal {
  id: string;
  grupo_id: string;
  usuario_id: string;
  rol: string;
  unido_en?: string | null;
  silenciado?: boolean;
  usuario?: {
    nombre: string | null;
    apellido?: string | null;
    avatar_url?: string | null;
  } | null;
}

/**
 * Space member available to add to channels.
 * Maps to miembros_espacio with usuarios join.
 */
export interface MiembroChatData {
  id: string;
  nombre: string | null;
  apellido?: string | null;
  avatar_url?: string | null;
  rol?: string;
}

/**
 * User name information (meeting room chat).
 */
export interface NombreUsuario {
  nombre: string;
  apellido: string | null;
}

/**
 * Callback signature for new message events.
 */
export type OnNuevoMensajeCallback = (mensaje: MensajeChatRecord) => void;

// ─── Port ─────────────────────────────────────────────────────────────────────

/**
 * Repository contract for all chat operations.
 *
 * Split into two sections:
 *  1. Space chat — channels, DMs, members, file uploads
 *  2. Meeting chat — legacy methods for meeting room chat
 */
export interface IChatRepository {

  // ── Space chat ──────────────────────────────────────────────────────────────

  /**
   * Get all chat groups/channels for a workspace.
   */
  obtenerGrupos(espacioId: string): Promise<ChatGroup[]>;

  /**
   * Get metadata for a single group (nombre, tipo).
   */
  obtenerInfoGrupo(grupoId: string): Promise<{ nombre: string; tipo: string } | null>;

  /**
   * Create a new chat group/channel.
   * Returns null on failure.
   */
  crearGrupo(datos: DatosCrearGrupo): Promise<ChatGroup | null>;

  /**
   * Delete a chat group.
   * Returns true on success, false on failure.
   */
  eliminarGrupo(grupoId: string): Promise<boolean>;

  /**
   * Delete all members of a group (cleanup before eliminarGrupo).
   */
  eliminarMiembrosGrupo(grupoId: string): Promise<void>;

  /**
   * Delete all messages in a group (cleanup before eliminarGrupo).
   */
  eliminarMensajesGrupo(grupoId: string): Promise<void>;

  /**
   * Get members of a channel with their roles.
   */
  obtenerMiembrosCanal(grupoId: string): Promise<MiembroCanal[]>;

  /**
   * Add a user to a channel with the given role.
   */
  agregarMiembroCanal(grupoId: string, usuarioId: string, rol: string): Promise<void>;

  /**
   * Get space members available to add to channels.
   * Excludes the current user.
   */
  obtenerMiembrosEspacio(espacioId: string, usuarioActualId: string): Promise<MiembroChatData[]>;

  /**
   * Load messages for a channel, ordered ascending by creado_en.
   */
  obtenerMensajes(grupoId: string): Promise<MensajeChatData[]>;

  /**
   * Load a message thread: root message + all replies, ordered ascending.
   */
  obtenerHilo(mensajeId: string): Promise<MensajeChatData[]>;

  /**
   * Send a message to a channel.
   * Returns created message or null on failure.
   */
  enviarMensaje(datos: DatosCrearMensaje): Promise<MensajeChatData | null>;

  /**
   * Count replies for each message ID.
   * Returns a map of messageId → replyCount.
   */
  contarRespuestas(messageIds: string[]): Promise<Record<string, number>>;

  /**
   * Upload a file to chat storage.
   * Returns public URL on success, null on failure.
   */
  subirArchivo(espacioId: string, archivo: File): Promise<string | null>;

  // ── Meeting room chat (legacy) ───────────────────────────────────────────────

  /**
   * Get or create a chat group for a meeting room.
   */
  obtenerOCrearGrupoChatReunion(
    salaId: string,
    espacioId: string,
    nombre: string
  ): Promise<string>;

  /**
   * Load chat message history for a group (meeting room pagination).
   */
  obtenerHistorialMensajes(
    grupoId: string,
    limit: number
  ): Promise<MensajeChatRecord[]>;

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
    onNuevoMensaje: OnNuevoMensajeCallback
  ): Promise<() => void>;

  /**
   * Lookup user name information by user ID.
   */
  obtenerNombreUsuario(userId: string): Promise<NombreUsuario | null>;

  /**
   * Validate that a user is an authorized participant in a sala.
   */
  resolverUsuarioParticipante(
    salaId: string,
    userId: string
  ): Promise<string | null>;
}
