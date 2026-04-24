/**
 * @module infrastructure/adapters/ChatSupabaseRepository
 * @description Supabase implementation of IChatRepository port.
 * Handles all chat persistence and realtime subscriptions for meeting rooms.
 *
 * Clean Architecture: Infrastructure layer adapter implementing the domain port.
 * Dependency Inversion: Domain depends on IChatRepository interface, not this implementation.
 *
 * Ref: Supabase JS v2 — PostgREST API, Realtime channels, postgres_changes
 * Ref: Logger — structured logging with child namespaces
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ChatGroup } from '@/types';
import type {
  IChatRepository,
  MensajeChatRecord,
  MensajeChatData,
  InsertarMensajeChatData,
  DatosCrearMensaje,
  DatosCrearGrupo,
  MiembroCanal,
  MiembroChatData,
  NombreUsuario,
  OnNuevoMensajeCallback,
} from '@/core/domain/ports/IChatRepository';

const log = logger.child('chat-repository');

/**
 * Database row shape for a chat message with user join.
 * Matches the estructura returned by:
 * `select('id, contenido, creado_en, usuario_id, usuario:usuarios!usuario_id(nombre, apellido)')`
 */
interface MensajeChatRow {
  id: string;
  contenido: string;
  creado_en: string;
  usuario_id: string | null;
  usuario: {
    nombre: string | null;
    apellido: string | null;
  } | null;
}

/**
 * Payload shape for postgres_changes INSERT event on mensajes_chat.
 * Emitted by Supabase realtime when a new message is inserted.
 */
interface MensajeChatPayload {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  contenido: string;
  tipo: string;
  creado_en: string;
}

/**
 * Supabase implementation of the IChatRepository port.
 * Provides get/create operations, message history retrieval,
 * message insertion, and realtime subscriptions for chat groups.
 */
export class ChatSupabaseRepository implements IChatRepository {
  /**
   * Get or create a chat group for a meeting room.
   *
   * First attempts to find an existing chat group linked to the sala.
   * If not found, creates a new private reunion-type group.
   *
   * @param salaId - Room identifier
   * @param espacioId - Workspace identifier
   * @param nombre - Display name for the chat group
   * @returns Promise resolving to the chat group ID
   * @throws On database errors
   */
  async obtenerOCrearGrupoChatReunion(
    salaId: string,
    espacioId: string,
    nombre: string
  ): Promise<string> {
    log.debug('Checking for existing chat group', { salaId, espacioId });

    // First, try to find an existing chat group for this sala
    const { data: existingGroup, error: selectError } = await supabase
      .from('grupos_chat')
      .select('id')
      .eq('tipo', 'reunion')
      .eq('espacio_id', espacioId)
      .ilike('nombre', `%sala_${salaId.slice(0, 8)}%`)
      .maybeSingle();

    if (selectError) {
      log.error('Failed to query existing chat group', {
        salaId,
        espacioId,
        error: selectError.message,
      });
      throw selectError;
    }

    if (existingGroup) {
      log.info('Found existing chat group', {
        grupoId: existingGroup.id,
        salaId,
      });
      return existingGroup.id;
    }

    // Group does not exist, create a new one
    log.info('Creating new chat group for reunion', { salaId, espacioId });

    // RLS policy "Crear grupos" requires creado_por = auth.uid()
    // Read from Zustand store — NO async getUser() to avoid orphaned Web Lock.
    const { useStore } = await import('../../../../store/useStore');
    const userId = useStore.getState().session?.user?.id;
    if (!userId) {
      throw new Error('Cannot create chat group: user not authenticated');
    }

    const { data: newGroup, error: insertError } = await supabase
      .from('grupos_chat')
      .upsert(
        {
          nombre,
          espacio_id: espacioId,
          tipo: 'reunion',
          creado_por: userId,
        },
        { onConflict: 'espacio_id,nombre', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    if (insertError) {
      log.error('Failed to create chat group', {
        salaId,
        espacioId,
        error: insertError.message,
      });
      throw insertError;
    }

    // If upsert hit the conflict and ignoreDuplicates=true, newGroup is null.
    // Fall back to SELECT to retrieve the already-existing group.
    if (newGroup) {
      log.info('Chat group created successfully', { grupoId: newGroup.id, salaId });
      return newGroup.id;
    }

    const { data: existing, error: fallbackError } = await supabase
      .from('grupos_chat')
      .select('id')
      .eq('tipo', 'reunion')
      .eq('espacio_id', espacioId)
      .eq('nombre', nombre)
      .single();

    if (fallbackError || !existing) {
      throw fallbackError ?? new Error('Chat group not found after upsert conflict');
    }

    log.info('Chat group retrieved after conflict', { grupoId: existing.id, salaId });
    return existing.id;
  }

  /**
   * Load chat message history for a group.
   *
   * Retrieves messages ordered by creation time in ascending order,
   * limited to the specified count. Includes user join to provide
   * sender name information.
   *
   * @param grupoId - Chat group identifier
   * @param limit - Maximum number of messages to retrieve
   * @returns Promise resolving to array of message records
   * @throws On database errors
   */
  async obtenerHistorialMensajes(
    grupoId: string,
    limit: number
  ): Promise<MensajeChatRecord[]> {
    log.debug('Loading message history', { grupoId, limit });

    const { data, error } = await supabase
      .from('mensajes_chat')
      .select(
        'id, contenido, creado_en, usuario_id, usuario:usuarios!usuario_id(nombre, apellido)'
      )
      .eq('grupo_id', grupoId)
      .order('creado_en', { ascending: true })
      .limit(limit);

    if (error) {
      log.error('Failed to retrieve message history', {
        grupoId,
        limit,
        error: error.message,
      });
      throw error;
    }

    // Type guard and map to MensajeChatRecord
    const messages: MensajeChatRecord[] = (data as unknown as MensajeChatRow[]).map(
      (row) => ({
        id: row.id,
        grupo_id: grupoId,
        usuario_id: row.usuario_id,
        contenido: row.contenido,
        tipo: 'texto', // Inferred from schema design
        creado_en: row.creado_en,
        usuario: row.usuario,
      })
    );

    log.debug('Message history loaded', {
      grupoId,
      count: messages.length,
    });

    return messages;
  }

  /**
   * Insert a single chat message.
   *
   * Persists a new message to the mensajes_chat table.
   *
   * @param data - Message insertion payload
   * @returns Promise that resolves when message is persisted
   * @throws On database errors
   */
  async insertarMensaje(data: InsertarMensajeChatData): Promise<void> {
    log.debug('Inserting message', {
      grupoId: data.grupo_id,
      usuarioId: data.usuario_id,
    });

    const { error } = await supabase.from('mensajes_chat').insert(data);

    if (error) {
      log.error('Failed to insert message', {
        grupoId: data.grupo_id,
        usuarioId: data.usuario_id,
        error: error.message,
      });
      throw error;
    }

    log.debug('Message inserted successfully', {
      grupoId: data.grupo_id,
    });
  }

  /**
   * Subscribe to new messages in a group via realtime.
   *
   * Establishes a postgres_changes subscription filtered by grupo_id.
   * The returned cleanup function removes the channel and stops listening.
   *
   * @param grupoId - Chat group identifier
   * @param onNuevoMensaje - Callback fired when new message arrives
   * @returns Promise resolving to unsubscribe function
   * @throws On subscription errors
   */
  async suscribirMensajesNuevos(
    grupoId: string,
    onNuevoMensaje: OnNuevoMensajeCallback
  ): Promise<() => void> {
    log.info('Setting up realtime subscription for messages', { grupoId });

    const channelName = `meeting-chat-${grupoId}`;
    let channel: RealtimeChannel | null = null;

    return new Promise((resolve, reject) => {
      try {
        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'mensajes_chat',
              filter: `grupo_id=eq.${grupoId}`,
            },
            (payload: { new: unknown }) => {
              // Type guard: validate payload shape
              if (!isValidMensajeChatPayload(payload.new)) {
                log.warn('Received invalid message payload', {
                  grupoId,
                  payload: payload.new,
                });
                return;
              }

              const mensaje: MensajeChatRecord = {
                id: payload.new.id,
                grupo_id: payload.new.grupo_id,
                usuario_id: payload.new.usuario_id,
                contenido: payload.new.contenido,
                tipo: payload.new.tipo,
                creado_en: payload.new.creado_en,
              };

              log.debug('New message received via realtime', {
                grupoId,
                mensajeId: mensaje.id,
              });

              onNuevoMensaje(mensaje);
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              log.info('Realtime subscription established', { grupoId });
              resolve(() => {
                cleanup();
              });
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              const error = new Error(
                `Subscription failed with status: ${status}`
              );
              log.error('Realtime subscription error', {
                grupoId,
                status,
              });
              reject(error);
            }
          });
      } catch (err) {
        log.error('Failed to setup realtime subscription', {
          grupoId,
          error: err instanceof Error ? err.message : String(err),
        });
        reject(err);
      }

      /**
       * Cleanup function: removes the channel from realtime subscriptions.
       * Uses removeChannel to ensure proper cleanup.
       */
      const cleanup = () => {
        if (channel) {
          supabase.removeChannel(channel);
          log.info('Realtime subscription cleaned up', { grupoId });
        }
      };
    });
  }

  /**
   * Lookup user name information by user ID.
   *
   * Retrieves the nombre and apellido for a given user from the usuarios table.
   *
   * @param userId - User identifier to look up
   * @returns Promise resolving to user name info, or null if not found
   * @throws On database errors
   */
  async obtenerNombreUsuario(userId: string): Promise<NombreUsuario | null> {
    log.debug('Looking up user name', { userId });

    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, apellido')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to lookup user name', {
        userId,
        error: error.message,
      });
      throw error;
    }

    if (!data) {
      log.debug('User not found', { userId });
      return null;
    }

    const nombreUsuario: NombreUsuario = {
      nombre: data.nombre as string,
      apellido: data.apellido as string | null,
    };

    log.debug('User name retrieved', { userId, nombre: nombreUsuario.nombre });

    return nombreUsuario;
  }

  /**
   * Resolve whether a user is a valid participant in a sala.
   *
   * Validates that the user is an authorized participant for the given room
   * by checking the participantes_sala table. Returns the usuario_id if valid,
   * null otherwise. Used to determine if remote chat messages should be persisted.
   *
   * @param salaId - Room identifier
   * @param userId - User identifier to validate
   * @returns Promise resolving to usuario_id if valid, null otherwise
   * @throws On database errors
   */
  async resolverUsuarioParticipante(
    salaId: string,
    userId: string
  ): Promise<string | null> {
    log.debug('Resolving user participation in sala', { salaId, userId });

    const { data, error } = await supabase
      .from('participantes_sala')
      .select('usuario_id')
      .eq('sala_id', salaId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to resolve participant', {
        salaId,
        userId,
        error: error.message,
      });
      throw error;
    }

    if (!data) {
      log.debug('User is not a participant in sala', { salaId, userId });
      return null;
    }

    log.debug('User participation confirmed', { salaId, userId });

    return data.usuario_id as string;
  }

  // ── Space chat ──────────────────────────────────────────────────────────────

  async obtenerGrupos(espacioId: string): Promise<ChatGroup[]> {
    try {
      const { data, error } = await supabase
        .from('grupos_chat')
        .select('id, espacio_id, nombre, descripcion, tipo, icono, color, creado_por')
        .eq('espacio_id', espacioId)
        .order('creado_en', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ChatGroup[];
    } catch (err) {
      log.error('obtenerGrupos failed', { espacioId, error: String(err) });
      return [];
    }
  }

  async obtenerInfoGrupo(grupoId: string): Promise<{ nombre: string; tipo: string } | null> {
    try {
      const { data, error } = await supabase
        .from('grupos_chat')
        .select('nombre, tipo')
        .eq('id', grupoId)
        .single();

      if (error) throw error;
      return data as { nombre: string; tipo: string };
    } catch (err) {
      log.error('obtenerInfoGrupo failed', { grupoId, error: String(err) });
      return null;
    }
  }

  async crearGrupo(datos: DatosCrearGrupo): Promise<ChatGroup | null> {
    try {
      const { data, error } = await supabase
        .from('grupos_chat')
        .insert({
          espacio_id: datos.espacio_id,
          nombre: datos.nombre,
          tipo: datos.tipo,
          creado_por: datos.creado_por,
          icono: datos.icono ?? '💬',
          contrasena: datos.contrasena ?? null,
          descripcion: datos.descripcion ?? null,
        })
        .select('id, espacio_id, nombre, descripcion, tipo, icono, color, creado_por')
        .single();

      if (error) throw error;
      return data as ChatGroup;
    } catch (err) {
      log.error('crearGrupo failed', { datos, error: String(err) });
      return null;
    }
  }

  async eliminarGrupo(grupoId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('grupos_chat')
        .delete()
        .eq('id', grupoId);

      if (error) throw error;
      return true;
    } catch (err) {
      log.error('eliminarGrupo failed', { grupoId, error: String(err) });
      return false;
    }
  }

  async eliminarMiembrosGrupo(grupoId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('miembros_grupo')
        .delete()
        .eq('grupo_id', grupoId);

      if (error) throw error;
    } catch (err) {
      log.error('eliminarMiembrosGrupo failed', { grupoId, error: String(err) });
    }
  }

  async eliminarMensajesGrupo(grupoId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('mensajes_chat')
        .delete()
        .eq('grupo_id', grupoId);

      if (error) throw error;
    } catch (err) {
      log.error('eliminarMensajesGrupo failed', { grupoId, error: String(err) });
    }
  }

  async obtenerMiembrosCanal(grupoId: string): Promise<MiembroCanal[]> {
    try {
      const { data, error } = await supabase
        .from('miembros_grupo')
        .select(`
          id, grupo_id, usuario_id, rol, unido_en, silenciado,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .eq('grupo_id', grupoId);

      if (error) throw error;
      return (data ?? []) as unknown as MiembroCanal[];
    } catch (err) {
      log.error('obtenerMiembrosCanal failed', { grupoId, error: String(err) });
      return [];
    }
  }

  async agregarMiembroCanal(grupoId: string, usuarioId: string, rol: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('miembros_grupo')
        .upsert(
          { grupo_id: grupoId, usuario_id: usuarioId, rol },
          { onConflict: 'grupo_id,usuario_id' }
        );

      if (error) throw error;
    } catch (err) {
      log.error('agregarMiembroCanal failed', { grupoId, usuarioId, error: String(err) });
    }
  }

  async agregarMiembrosDM(grupoId: string, usuarioIds: string[]): Promise<void> {
    try {
      const { error } = await supabase.rpc('agregar_miembros_dm', {
        p_grupo_id: grupoId,
        p_usuario_ids: usuarioIds,
      });

      if (error) throw error;
    } catch (err) {
      log.error('agregarMiembrosDM failed', { grupoId, usuarioIds, error: String(err) });
      throw err;
    }
  }

  async obtenerMiembrosEspacio(
    espacioId: string,
    usuarioActualId: string
  ): Promise<MiembroChatData[]> {
    try {
      const { data, error } = await supabase
        .from('miembros_espacio')
        .select(`
          usuario_id,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .eq('espacio_id', espacioId)
        .neq('usuario_id', usuarioActualId);

      if (error) throw error;

      return ((data ?? []) as unknown as Array<{
        usuario_id: string;
        usuario: { nombre: string | null; apellido: string | null; avatar_url: string | null } | null;
      }>).map((m) => ({
        id: m.usuario_id,
        nombre: m.usuario?.nombre ?? null,
        apellido: m.usuario?.apellido ?? null,
        avatar_url: m.usuario?.avatar_url ?? null,
      }));
    } catch (err) {
      log.error('obtenerMiembrosEspacio failed', { espacioId, error: String(err) });
      return [];
    }
  }

  async obtenerMensajes(grupoId: string): Promise<MensajeChatData[]> {
    try {
      const { data, error } = await supabase
        .from('mensajes_chat')
        .select(`
          id, grupo_id, usuario_id, contenido, tipo, archivo_url,
          respuesta_a, menciones, respuestas_count, creado_en, editado, editado_en,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .eq('grupo_id', grupoId)
        .order('creado_en', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as MensajeChatData[];
    } catch (err) {
      log.error('obtenerMensajes failed', { grupoId, error: String(err) });
      return [];
    }
  }

  async obtenerHilo(mensajeId: string): Promise<MensajeChatData[]> {
    try {
      // Root message
      const { data: root, error: rootErr } = await supabase
        .from('mensajes_chat')
        .select(`
          id, grupo_id, usuario_id, contenido, tipo, archivo_url,
          respuesta_a, menciones, respuestas_count, creado_en, editado, editado_en,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .eq('id', mensajeId)
        .single();

      if (rootErr) throw rootErr;

      // Replies
      const { data: replies, error: repliesErr } = await supabase
        .from('mensajes_chat')
        .select(`
          id, grupo_id, usuario_id, contenido, tipo, archivo_url,
          respuesta_a, menciones, respuestas_count, creado_en, editado, editado_en,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .eq('respuesta_a', mensajeId)
        .order('creado_en', { ascending: true });

      if (repliesErr) throw repliesErr;

      return [root, ...(replies ?? [])] as unknown as MensajeChatData[];
    } catch (err) {
      log.error('obtenerHilo failed', { mensajeId, error: String(err) });
      return [];
    }
  }

  async enviarMensaje(datos: DatosCrearMensaje): Promise<MensajeChatData | null> {
    // Instrumentación 2026-04-23 (K.pre): los users reportaron "pueden leer
    // pero no responder". Sin logs info era imposible diagnosticar si fallaba
    // en el INSERT (RLS policies), en la suscripción (broadcast), o en el UI.
    // Ahora dejamos trazas en info-level sobre send success/failure por
    // grupo + tamaño de payload.
    log.info('enviarMensaje: sending', {
      grupoId: datos.grupo_id,
      usuarioId: datos.usuario_id,
      tipo: datos.tipo,
      contenidoLen: datos.contenido?.length ?? 0,
      esRespuesta: !!datos.respuesta_a,
      conMenciones: Array.isArray(datos.menciones) && datos.menciones.length > 0,
    });
    try {
      const { data, error } = await supabase
        .from('mensajes_chat')
        .insert({
          grupo_id: datos.grupo_id,
          usuario_id: datos.usuario_id,
          contenido: datos.contenido,
          tipo: datos.tipo,
          menciones: datos.menciones ?? null,
          respuesta_a: datos.respuesta_a ?? null,
        })
        .select(`
          id, grupo_id, usuario_id, contenido, tipo, archivo_url,
          respuesta_a, menciones, respuestas_count, creado_en, editado, editado_en,
          usuario:usuarios!usuario_id(nombre, apellido, avatar_url)
        `)
        .single();

      if (error) {
        // Exponer código/detail de RLS/constraint violations — la causa
        // más probable del bug reportado es policy `mensajes_chat_insert`
        // que requiere membership activa en el grupo.
        log.warn('enviarMensaje: DB insert failed', {
          grupoId: datos.grupo_id,
          usuarioId: datos.usuario_id,
          code: (error as { code?: string }).code,
          message: error.message,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });
        throw error;
      }
      log.info('enviarMensaje: sent ok', {
        grupoId: datos.grupo_id,
        mensajeId: (data as { id?: string })?.id,
      });
      return data as unknown as MensajeChatData;
    } catch (err) {
      log.error('enviarMensaje failed', { datos, error: String(err) });
      return null;
    }
  }

  async contarRespuestas(messageIds: string[]): Promise<Record<string, number>> {
    if (messageIds.length === 0) return {};

    try {
      const { data, error } = await supabase
        .from('mensajes_chat')
        .select('respuesta_a')
        .in('respuesta_a', messageIds);

      if (error) throw error;

      const conteo: Record<string, number> = {};
      for (const row of (data ?? [])) {
        if (row.respuesta_a) {
          conteo[row.respuesta_a] = (conteo[row.respuesta_a] ?? 0) + 1;
        }
      }
      return conteo;
    } catch (err) {
      log.error('contarRespuestas failed', { error: String(err) });
      return {};
    }
  }

  async subirArchivo(espacioId: string, archivo: File): Promise<string | null> {
    try {
      const ext = archivo.name.split('.').pop() ?? 'bin';
      const path = `${espacioId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-files')
        .upload(path, archivo, { upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('chat-files')
        .getPublicUrl(path);

      return data.publicUrl;
    } catch (err) {
      log.error('subirArchivo failed', { espacioId, fileName: archivo.name, error: String(err) });
      return null;
    }
  }
}

/**
 * Type guard: validates that a value matches MensajeChatPayload shape.
 * Ensures payload has required fields before casting.
 *
 * @param value - Unknown value to validate
 * @returns true if value matches MensajeChatPayload shape
 */
function isValidMensajeChatPayload(value: unknown): value is MensajeChatPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.id === 'string' &&
    typeof payload.grupo_id === 'string' &&
    (payload.usuario_id === null || typeof payload.usuario_id === 'string') &&
    typeof payload.contenido === 'string' &&
    typeof payload.tipo === 'string' &&
    typeof payload.creado_en === 'string'
  );
}

/**
 * Singleton instance of ChatSupabaseRepository.
 * Use this instance throughout the application for consistent chat operations.
 */
export const chatRepository = new ChatSupabaseRepository();
