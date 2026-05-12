/**
 * @module infrastructure/adapters/MeetingChatSupabaseRepository
 * @description Supabase adapter para `IMeetingChatRepository`.
 *
 * Sub-adapter del split 2026-05-09 (ITEM 17 fase B). Maneja el chat legacy
 * de salas de reunión (postgres_changes realtime + tabla `mensajes_chat`
 * + lookup `usuarios` + validación participación en `participantes_sala`).
 *
 * Clean Architecture: Infrastructure layer adapter implementing
 * `IMeetingChatRepository` (split de `IChatRepository`).
 *
 * Refs:
 * - Supabase JS v2 — PostgREST API, Realtime channels
 * - tabla `grupos_chat` (tipo='reunion')
 * - tabla `mensajes_chat` (relación grupo_id → grupos_chat.id)
 * - tabla `usuarios` (join nombre/apellido)
 * - tabla `participantes_sala` (validación)
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  IMeetingChatRepository,
} from '@/core/domain/ports/IMeetingChatRepository';
import type {
  MensajeChatRecord,
  InsertarMensajeChatData,
  NombreUsuario,
  OnNuevoMensajeCallback,
} from '@/core/domain/ports/IChatRepository';

const log = logger.child('chat-meeting-repository');

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
 */
interface MensajeChatPayload {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  contenido: string;
  tipo: string;
  creado_en: string;
}

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

export class MeetingChatSupabaseRepository implements IMeetingChatRepository {
  async obtenerOCrearGrupoChatReunion(
    salaId: string,
    espacioId: string,
    nombre: string,
  ): Promise<string> {
    log.debug('Checking for existing chat group', { salaId, espacioId });

    const { data: existingGroup, error: selectError } = await supabase
      .from('grupos_chat')
      .select('id')
      .eq('tipo', 'reunion')
      .eq('espacio_id', espacioId)
      .ilike('nombre', `%sala_${salaId.slice(0, 8)}%`)
      .maybeSingle();

    if (selectError) {
      log.error('Failed to query existing chat group', {
        salaId, espacioId, error: selectError.message,
      });
      throw selectError;
    }

    if (existingGroup) {
      log.info('Found existing chat group', { grupoId: existingGroup.id, salaId });
      return existingGroup.id;
    }

    log.info('Creating new chat group for reunion', { salaId, espacioId });

    // RLS: creado_por debe matchear auth.uid(). Read síncrono del Zustand store
    // para evitar orphaned Web Lock que causa async getUser().
    const { useComposedStore } = await import('@/modules/_state/composedStore');
    const userId = useComposedStore.getState().session?.user?.id;
    if (!userId) {
      throw new Error('Cannot create chat group: user not authenticated');
    }

    const { data: newGroup, error: insertError } = await supabase
      .from('grupos_chat')
      .upsert(
        { nombre, espacio_id: espacioId, tipo: 'reunion', creado_por: userId },
        { onConflict: 'espacio_id,nombre', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();

    if (insertError) {
      log.error('Failed to create chat group', {
        salaId, espacioId, error: insertError.message,
      });
      throw insertError;
    }

    if (newGroup) {
      log.info('Chat group created successfully', { grupoId: newGroup.id, salaId });
      return newGroup.id;
    }

    // Conflict path: upsert ignored, fallback SELECT con retry para race RLS/replicación.
    // FIX 2026-05-12: usar maybeSingle() (no throw en 0 rows) + 1 retry tras 150ms,
    // ya que la replicación post-upsert puede tardar unos ms en propagar a la
    // RLS read query desde el mismo cliente.
    // Ref: https://supabase.com/docs/reference/javascript/maybesingle
    const buscarGrupoExistente = async () => {
      return supabase
        .from('grupos_chat')
        .select('id')
        .eq('tipo', 'reunion')
        .eq('espacio_id', espacioId)
        .eq('nombre', nombre)
        .maybeSingle();
    };

    let { data: existing, error: fallbackError } = await buscarGrupoExistente();
    if (!existing && !fallbackError) {
      await new Promise((r) => setTimeout(r, 150));
      ({ data: existing, error: fallbackError } = await buscarGrupoExistente());
    }

    if (fallbackError || !existing) {
      throw fallbackError ?? new Error('Chat group not found after upsert conflict');
    }

    log.info('Chat group retrieved after conflict', { grupoId: existing.id, salaId });
    return existing.id;
  }

  async obtenerHistorialMensajes(
    grupoId: string,
    limit: number,
  ): Promise<MensajeChatRecord[]> {
    log.debug('Loading message history', { grupoId, limit });

    const { data, error } = await supabase
      .from('mensajes_chat')
      .select(
        'id, contenido, creado_en, usuario_id, usuario:usuarios!usuario_id(nombre, apellido)',
      )
      .eq('grupo_id', grupoId)
      .order('creado_en', { ascending: true })
      .limit(limit);

    if (error) {
      log.error('Failed to retrieve message history', {
        grupoId, limit, error: error.message,
      });
      throw error;
    }

    const messages: MensajeChatRecord[] = (data as unknown as MensajeChatRow[]).map((row) => ({
      id: row.id,
      grupo_id: grupoId,
      usuario_id: row.usuario_id,
      contenido: row.contenido,
      tipo: 'texto',
      creado_en: row.creado_en,
      usuario: row.usuario,
    }));

    log.debug('Message history loaded', { grupoId, count: messages.length });
    return messages;
  }

  async insertarMensaje(data: InsertarMensajeChatData): Promise<void> {
    log.debug('Inserting message', { grupoId: data.grupo_id, usuarioId: data.usuario_id });

    const { error } = await supabase.from('mensajes_chat').insert(data);

    if (error) {
      log.error('Failed to insert message', {
        grupoId: data.grupo_id, usuarioId: data.usuario_id, error: error.message,
      });
      throw error;
    }
  }

  async suscribirMensajesNuevos(
    grupoId: string,
    onNuevoMensaje: OnNuevoMensajeCallback,
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
            { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `grupo_id=eq.${grupoId}` },
            (payload: { new: unknown }) => {
              if (!isValidMensajeChatPayload(payload.new)) {
                log.warn('Received invalid message payload', { grupoId, payload: payload.new });
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
              log.debug('New message received via realtime', { grupoId, mensajeId: mensaje.id });
              onNuevoMensaje(mensaje);
            },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              log.info('Realtime subscription established', { grupoId });
              resolve(() => cleanup());
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              const error = new Error(`Subscription failed with status: ${status}`);
              log.error('Realtime subscription error', { grupoId, status });
              reject(error);
            }
          });
      } catch (err) {
        log.error('Failed to setup realtime subscription', {
          grupoId, error: err instanceof Error ? err.message : String(err),
        });
        reject(err);
      }

      const cleanup = () => {
        if (channel) {
          supabase.removeChannel(channel);
          log.info('Realtime subscription cleaned up', { grupoId });
        }
      };
    });
  }

  async obtenerNombreUsuario(userId: string): Promise<NombreUsuario | null> {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, apellido')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to lookup user name', { userId, error: error.message });
      throw error;
    }
    if (!data) return null;

    return {
      nombre: data.nombre as string,
      apellido: data.apellido as string | null,
    };
  }

  async resolverUsuarioParticipante(salaId: string, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('participantes_sala')
      .select('usuario_id')
      .eq('sala_id', salaId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to resolve participant', { salaId, userId, error: error.message });
      throw error;
    }
    if (!data) return null;

    return data.usuario_id as string;
  }
}

export const meetingChatRepository: IMeetingChatRepository = new MeetingChatSupabaseRepository();
