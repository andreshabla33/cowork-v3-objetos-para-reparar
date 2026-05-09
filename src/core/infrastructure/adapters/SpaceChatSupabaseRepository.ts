/**
 * @module infrastructure/adapters/SpaceChatSupabaseRepository
 * @description Supabase adapter para `ISpaceChatRepository`.
 *
 * Sub-adapter del split 2026-05-09 (ITEM 17 fase B). Maneja el chat de
 * espacio: canales, mensajes ricos (con archivos, hilos, menciones), DMs,
 * miembros del espacio + canal, y file uploads a Storage bucket `chat-files`.
 *
 * Clean Architecture: Infrastructure layer adapter implementing
 * `ISpaceChatRepository` (split de `IChatRepository`).
 *
 * Refs:
 * - Supabase JS v2 — PostgREST, Storage, RPC
 * - tablas `grupos_chat`, `miembros_grupo`, `mensajes_chat`, `miembros_espacio`,
 *   `usuarios`
 * - bucket Storage `chat-files`
 * - RPC `agregar_miembros_dm` (SECURITY DEFINER)
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { ChatGroup } from '@/types';
import type { ISpaceChatRepository } from '@/core/domain/ports/ISpaceChatRepository';
import type {
  MensajeChatData,
  DatosCrearMensaje,
  DatosCrearGrupo,
  MiembroCanal,
  MiembroChatData,
} from '@/core/domain/ports/IChatRepository';

const log = logger.child('chat-space-repository');

export class SpaceChatSupabaseRepository implements ISpaceChatRepository {
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
      const { error } = await supabase.from('grupos_chat').delete().eq('id', grupoId);
      if (error) throw error;
      return true;
    } catch (err) {
      log.error('eliminarGrupo failed', { grupoId, error: String(err) });
      return false;
    }
  }

  async eliminarMiembrosGrupo(grupoId: string): Promise<void> {
    try {
      const { error } = await supabase.from('miembros_grupo').delete().eq('grupo_id', grupoId);
      if (error) throw error;
    } catch (err) {
      log.error('eliminarMiembrosGrupo failed', { grupoId, error: String(err) });
    }
  }

  async eliminarMensajesGrupo(grupoId: string): Promise<void> {
    try {
      const { error } = await supabase.from('mensajes_chat').delete().eq('grupo_id', grupoId);
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
          { onConflict: 'grupo_id,usuario_id' },
        );
      if (error) throw error;
    } catch (err) {
      log.error('agregarMiembroCanal failed', { grupoId, usuarioId, error: String(err) });
    }
  }

  async agregarMiembrosCanal(
    grupoId: string,
    usuarioIds: string[],
    rol: string,
  ): Promise<void> {
    if (usuarioIds.length === 0) return;
    try {
      const rows = usuarioIds.map((usuario_id) => ({ grupo_id: grupoId, usuario_id, rol }));
      const { error } = await supabase
        .from('miembros_grupo')
        .upsert(rows, { onConflict: 'grupo_id,usuario_id' });
      if (error) throw error;
    } catch (err) {
      log.error('agregarMiembrosCanal failed', { grupoId, count: usuarioIds.length, error: String(err) });
      throw err;
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
    usuarioActualId: string,
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

  async obtenerOCrearChatDirecto(
    userA: string,
    userB: string,
    espacioId: string,
  ): Promise<string | null> {
    try {
      // Method 1: lookup by group name (legacy ChatPanel writes "userA|userB").
      const namePattern1 = `${userA}|${userB}`;
      const namePattern2 = `${userB}|${userA}`;
      const { data: groupByName } = await supabase
        .from('grupos_chat')
        .select('id')
        .eq('tipo', 'directo')
        .eq('espacio_id', espacioId)
        .or(`nombre.eq.${namePattern1},nombre.eq.${namePattern2}`)
        .limit(1)
        .maybeSingle();

      if (groupByName) return (groupByName as { id: string }).id;

      // Method 2: lookup by member intersection.
      const { data: userGroups } = await supabase
        .from('miembros_grupo')
        .select('grupo_id')
        .eq('usuario_id', userA);

      if (userGroups && userGroups.length > 0) {
        const groupIds = (userGroups as Array<{ grupo_id: string }>).map((g) => g.grupo_id);
        const { data: commonGroup } = await supabase
          .from('miembros_grupo')
          .select('grupo_id, grupos_chat!inner(tipo)')
          .in('grupo_id', groupIds)
          .eq('usuario_id', userB)
          .eq('grupos_chat.tipo', 'directo')
          .limit(1)
          .maybeSingle();

        if (commonGroup) return (commonGroup as { grupo_id: string }).grupo_id;
      }

      // Provision: new direct group + both memberships.
      const { data: newGroup, error: groupError } = await supabase
        .from('grupos_chat')
        .insert({
          espacio_id: espacioId,
          nombre: 'Directo',
          tipo: 'directo',
          creado_por: userA,
        })
        .select()
        .single();

      if (groupError || !newGroup) {
        log.warn('Failed to create direct chat group', {
          error: groupError?.message, userA, userB,
        });
        return null;
      }

      const newGroupId = (newGroup as { id: string }).id;
      const { error: membersError } = await supabase
        .from('miembros_grupo')
        .insert([
          { grupo_id: newGroupId, usuario_id: userA },
          { grupo_id: newGroupId, usuario_id: userB },
        ]);

      if (membersError) {
        log.warn('Failed to add members to new direct chat', {
          error: membersError.message, newGroupId,
        });
      }

      return newGroupId;
    } catch (err) {
      log.error('obtenerOCrearChatDirecto failed', { userA, userB, error: String(err) });
      return null;
    }
  }

  async enviarMensaje(datos: DatosCrearMensaje): Promise<MensajeChatData | null> {
    // Instrumentación 2026-04-23 (K.pre): users reportaron "pueden leer pero
    // no responder". Sin logs info era imposible diagnosticar (RLS vs broadcast
    // vs UI). Trazas info-level ahora exponen send success/failure por grupo.
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

      const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      log.error('subirArchivo failed', {
        espacioId, fileName: archivo.name, error: String(err),
      });
      return null;
    }
  }
}

export const spaceChatRepository: ISpaceChatRepository = new SpaceChatSupabaseRepository();
