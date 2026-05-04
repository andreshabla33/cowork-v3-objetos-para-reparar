/**
 * @module infrastructure/adapters/EspacioObjetosSupabaseRepository
 *
 * Clean Architecture — Infrastructure adapter para `IEspacioObjetosRepository`.
 *
 * Implementa CRUD + realtime sobre las tablas `espacio_objetos` y
 * `miembros_espacio` (spawn personal). Es la única capa que toca Supabase
 * para esta feature; el hook `useEspacioObjetos` consume el port.
 *
 * Refs:
 *  - Supabase JS v2 — `from / select / insert / update / upsert / delete`
 *  - Supabase Realtime — `channel.on('postgres_changes', ...)`
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IEspacioObjetosRepository,
  CatalogoObjeto3DRuntime,
  CrearObjetoInput,
  ReemplazarObjetoPayload,
  UpsertObjetoPayload,
  TransformacionObjetoPatch,
  RealtimeObjetosHandlers,
  SpawnPersonal,
} from '@/src/core/domain/ports/IEspacioObjetosRepository';
import type { ObjetoEspacio3D as EspacioObjeto } from '@/src/core/domain/entities/espacio3d';

const log = logger.child('espacio-objetos-repo');

const CATALOGO_FIELDS = [
  'id',
  'slug',
  'tipo',
  'modelo_url',
  'built_in_geometry',
  'built_in_color',
  'ancho',
  'alto',
  'profundidad',
  'es_sentable',
  'sit_offset_x',
  'sit_offset_y',
  'sit_offset_z',
  'sit_rotation_y',
  'es_interactuable',
  'interaccion_tipo',
  'interaccion_radio',
  'interaccion_emoji',
  'interaccion_label',
  'interaccion_config',
  'configuracion_geometria',
  'es_reclamable',
  'premium',
  'escala_normalizacion',
  'es_superficie',
].join(',');

export class EspacioObjetosSupabaseRepository implements IEspacioObjetosRepository {
  async listarPorEspacio(espacioId: string): Promise<EspacioObjeto[]> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .select('*')
      .eq('espacio_id', espacioId);

    if (error) {
      log.error('listarPorEspacio failed', { espacioId, error: error.message });
      throw error;
    }
    return (data ?? []) as EspacioObjeto[];
  }

  async obtenerCatalogoRuntime(): Promise<CatalogoObjeto3DRuntime[]> {
    const { data, error } = await supabase
      .from('catalogo_objetos_3d')
      .select(CATALOGO_FIELDS);

    if (error) {
      log.error('obtenerCatalogoRuntime failed', { error: error.message });
      throw error;
    }
    // Cast vía unknown porque el `select` con string fields no infiere
    // los tipos exactos del subset; el campo es validado en runtime por la DB.
    return (data ?? []) as unknown as CatalogoObjeto3DRuntime[];
  }

  async obtenerSpawnPersonal(
    espacioId: string,
    userId: string,
  ): Promise<SpawnPersonal | null> {
    const { data, error } = await supabase
      .from('miembros_espacio')
      .select('spawn_x, spawn_z')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      log.warn('obtenerSpawnPersonal failed', { espacioId, userId, error: error.message });
      return null;
    }
    return data ? { spawn_x: data.spawn_x, spawn_z: data.spawn_z } : null;
  }

  async crear(input: CrearObjetoInput): Promise<EspacioObjeto> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .insert(input)
      .select()
      .single();

    if (error) {
      log.error('crear failed', { error: error.message });
      throw error;
    }
    return data as EspacioObjeto;
  }

  async reemplazar(
    objetoId: string,
    payload: ReemplazarObjetoPayload,
  ): Promise<EspacioObjeto> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .update(payload)
      .eq('id', objetoId)
      .select()
      .single();

    if (error) {
      log.error('reemplazar failed', { objetoId, error: error.message });
      throw error;
    }
    return data as EspacioObjeto;
  }

  async actualizarTransformacion(
    objetoId: string,
    patch: TransformacionObjetoPatch,
  ): Promise<void> {
    const { error } = await supabase
      .from('espacio_objetos')
      .update(patch)
      .eq('id', objetoId);

    if (error) {
      log.error('actualizarTransformacion failed', { objetoId, error: error.message });
      throw error;
    }
  }

  async eliminar(objetoId: string): Promise<void> {
    const { error } = await supabase
      .from('espacio_objetos')
      .delete()
      .eq('id', objetoId);

    if (error) {
      log.error('eliminar failed', { objetoId, error: error.message });
      throw error;
    }
  }

  async insertarBatch(entradas: CrearObjetoInput[]): Promise<EspacioObjeto[]> {
    if (entradas.length === 0) return [];
    const { data, error } = await supabase
      .from('espacio_objetos')
      .insert(entradas)
      .select();

    if (error) {
      log.error('insertarBatch failed', { count: entradas.length, error: error.message });
      throw error;
    }
    return (data ?? []) as EspacioObjeto[];
  }

  async upsert(objeto: UpsertObjetoPayload): Promise<EspacioObjeto> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .upsert(objeto, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      log.error('upsert failed', { objetoId: objeto.id, error: error.message });
      throw error;
    }
    return data as EspacioObjeto;
  }

  async reclamar(objetoId: string, userId: string): Promise<EspacioObjeto[]> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: userId })
      .eq('id', objetoId)
      .is('owner_id', null)
      .select();

    if (error) {
      log.error('reclamar failed', { objetoId, userId, error: error.message });
      throw error;
    }
    return (data ?? []) as EspacioObjeto[];
  }

  async liberarEscritorioActualDelUsuario(
    userId: string,
    exceptObjetoId: string,
  ): Promise<void> {
    // Solo libera el escritorio si NO es el que se está reclamando ahora.
    // Idempotente: si el usuario no tiene escritorio, no afecta filas.
    const { error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: null })
      .eq('owner_id', userId)
      .neq('id', exceptObjetoId);

    if (error) {
      log.warn('liberarEscritorioActualDelUsuario failed', {
        userId,
        exceptObjetoId,
        error: error.message,
      });
    }
  }

  async liberar(objetoId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: null })
      .eq('id', objetoId)
      .eq('owner_id', userId)
      .select();

    if (error) {
      log.error('liberar failed', { objetoId, userId, error: error.message });
      throw error;
    }
    return (data?.length ?? 0) > 0;
  }

  async guardarSpawnPersonal(
    espacioId: string,
    userId: string,
    x: number,
    z: number,
  ): Promise<void> {
    const { error } = await supabase
      .from('miembros_espacio')
      .update({ spawn_x: x, spawn_z: z })
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId);

    if (error) {
      log.error('guardarSpawnPersonal failed', {
        espacioId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  async limpiarSpawnPersonal(espacioId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('miembros_espacio')
      .update({ spawn_x: null, spawn_z: null })
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId);

    if (error) {
      log.warn('limpiarSpawnPersonal failed', {
        espacioId,
        userId,
        error: error.message,
      });
    }
  }

  suscribirCambios(
    espacioId: string,
    handlers: RealtimeObjetosHandlers,
  ): () => void {
    const channel = supabase
      .channel(`espacio_objetos:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'espacio_objetos',
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            handlers.onInsert(payload.new as EspacioObjeto);
          } else if (payload.eventType === 'UPDATE') {
            handlers.onUpdate(payload.new as EspacioObjeto);
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as Record<string, unknown>)?.id as string;
            if (id) handlers.onDelete(id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
