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

/**
 * Payload shape for postgres_changes INSERT events on `mensajes_chat`.
 * El adapter lo emite tal cual lo recibe de Supabase Realtime, pero con
 * un contrato de Domain para que la Presentation no consuma `unknown`.
 */
export interface MensajeChatRealtimeRecord {
  id: string;
  grupo_id: string;
  usuario_id: string;
  contenido: string;
  menciones: string[] | null;
  respuesta_a: string | null;
  editado: boolean;
  creado_en: string;
}

export interface MensajeChatRealtimePayload {
  schema: string;
  table: 'mensajes_chat';
  commit_timestamp: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: MensajeChatRealtimeRecord;
  old?: Partial<MensajeChatRealtimeRecord> | null;
}

// ─── Port ─────────────────────────────────────────────────────────────────────

import type { ISpaceChatRepository } from './ISpaceChatRepository';
import type { IMeetingChatRepository } from './IMeetingChatRepository';

/**
 * Repository contract for all chat operations (composition of sub-ports).
 *
 * Split 2026-05-09 (ITEM 17 fase B):
 *  - `ISpaceChatRepository` — channels, DMs, members, file uploads (17 métodos)
 *  - `IMeetingChatRepository` — meeting room chat legacy (6 métodos)
 *
 * `IChatRepository` se mantiene como union para compat con consumers existentes
 * que ya consumen el contrato unificado. Nuevos consumers deberían depender del
 * sub-port específico para reducir la superficie inyectada.
 */
export interface IChatRepository extends ISpaceChatRepository, IMeetingChatRepository {}
