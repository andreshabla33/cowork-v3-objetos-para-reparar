/**
 * @module infrastructure/adapters/AreaEscritorioSupabaseRepository
 * @description Supabase adapter para IAreaEscritorioRepository.
 *
 * Tabla: `areas_escritorio`.
 * RPCs:
 *   - reclamar_area_escritorio(p_area_id)
 *   - liberar_area_escritorio(p_area_id)
 *   - designar_area_escritorio(p_espacio_id, p_centro_x, p_centro_z, p_ancho, p_alto, p_nombre, p_audio_aislado)
 *   - asignar_area_escritorio(p_area_id, p_usuario_id)
 *   - reasignar_area_escritorio(p_area_id, p_nuevo_usuario_id)
 *   - eliminar_area_escritorio(p_area_id)
 * Realtime: postgres_changes filtered by espacio_id.
 *
 * Refs:
 *  - https://supabase.com/docs/reference/javascript/rpc
 *  - https://supabase.com/docs/guides/realtime/postgres-changes
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import {
  crearBboxAreaEscritorio,
  type AreaEscritorio,
  type BboxAreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type {
  IAreaEscritorioRepository,
  EventoAreaEscritorio,
  ResultadoMutacionAreaEscritorio,
} from '@/src/core/domain/ports/IAreaEscritorioRepository';

const log = logger.child('area-escritorio-repository');

// ─── Row → entity mapper ────────────────────────────────────────────────────

/**
 * Mapea una fila DB cruda al value object del Domain. Normaliza tipos
 * numéricos (Supabase retorna `numeric` como string), valida invariantes
 * de bbox, y deja la entity inmutable.
 */
function filaAArea(row: Record<string, unknown>): AreaEscritorio {
  const bbox: BboxAreaEscritorio = crearBboxAreaEscritorio({
    centroX: row.centro_x as number | string,
    centroZ: row.centro_z as number | string,
    ancho: row.ancho as number | string,
    alto: row.alto as number | string,
  });
  return {
    id: String(row.id),
    espacio_id: String(row.espacio_id),
    bbox,
    nombre: String(row.nombre),
    asignado_a_usuario_id: (row.asignado_a_usuario_id as string | null) ?? null,
    reclamado_por_usuario_id: (row.reclamado_por_usuario_id as string | null) ?? null,
    audio_aislado: Boolean(row.audio_aislado),
    creado_en: String(row.creado_en),
    actualizado_en: String(row.actualizado_en),
  };
}

/**
 * Mapea un error PostgREST/Postgres a uno de los `motivo` del puerto.
 * El servidor lanza `RAISE EXCEPTION` con códigos legibles (e.g. 'YA_RECLAMADA');
 * acá los matcheamos al enum del Domain para que la UI los renderice.
 */
function mapearMotivoError(err: { message?: string; details?: string; code?: string } | null | undefined): ResultadoMutacionAreaEscritorio {
  const haystack = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`.toUpperCase();
  if (haystack.includes('NO_AUTORIZADO')) return { ok: false, motivo: 'no_autorizado' };
  if (haystack.includes('YA_RECLAMADA')) return { ok: false, motivo: 'ya_reclamada' };
  if (haystack.includes('PRE_ASIGNADA_A_OTRO')) return { ok: false, motivo: 'pre_asignada_a_otro' };
  if (haystack.includes('NO_ES_MI_AREA')) return { ok: false, motivo: 'no_es_mi_area' };
  if (haystack.includes('NO_ENCONTRADA')) return { ok: false, motivo: 'no_encontrada' };
  // Network / 5xx
  if (haystack.includes('NETWORK') || haystack.includes('TIMEOUT') || haystack.includes('FETCH')) {
    return { ok: false, motivo: 'error_red' };
  }
  return { ok: false, motivo: 'error' };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class AreaEscritorioSupabaseRepository implements IAreaEscritorioRepository {
  async listarPorEspacio(espacioId: string): Promise<AreaEscritorio[]> {
    const { data, error } = await supabase
      .from('areas_escritorio')
      .select('*')
      .eq('espacio_id', espacioId);
    if (error) {
      log.error('Error listando areas_escritorio', { error: error.message, espacioId });
      throw error;
    }
    return (data ?? []).map((row) => filaAArea(row as Record<string, unknown>));
  }

  suscribirCambios(espacioId: string, callback: (evento: EventoAreaEscritorio) => void): () => void {
    const channel = supabase
      .channel(`areas_escritorio:${espacioId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'areas_escritorio',
        filter: `espacio_id=eq.${espacioId}`,
      }, (payload) => {
        try {
          if (payload.eventType === 'INSERT') {
            callback({ tipo: 'INSERT', area: filaAArea(payload.new as Record<string, unknown>) });
          } else if (payload.eventType === 'UPDATE') {
            callback({ tipo: 'UPDATE', area: filaAArea(payload.new as Record<string, unknown>) });
          } else if (payload.eventType === 'DELETE') {
            callback({ tipo: 'DELETE', area: filaAArea(payload.old as Record<string, unknown>) });
          }
        } catch (err) {
          log.warn('Payload realtime inválido', {
            event: payload.eventType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async reclamar(areaId: string): Promise<ResultadoMutacionAreaEscritorio> {
    const { data, error } = await supabase.rpc('reclamar_area_escritorio', { p_area_id: areaId });
    if (error) {
      log.warn('Error reclamando area', { error: error.message, areaId });
      return mapearMotivoError(error);
    }
    return { ok: true, area: filaAArea(data as Record<string, unknown>) };
  }

  async liberar(areaId: string): Promise<ResultadoMutacionAreaEscritorio> {
    const { data, error } = await supabase.rpc('liberar_area_escritorio', { p_area_id: areaId });
    if (error) {
      log.warn('Error liberando area', { error: error.message, areaId });
      return mapearMotivoError(error);
    }
    return { ok: true, area: filaAArea(data as Record<string, unknown>) };
  }

  async designar(input: {
    espacioId: string;
    bbox: BboxAreaEscritorio;
    nombre: string;
    audioAislado: boolean;
  }): Promise<ResultadoMutacionAreaEscritorio> {
    const { data, error } = await supabase.rpc('designar_area_escritorio', {
      p_espacio_id: input.espacioId,
      p_centro_x: input.bbox.centroX,
      p_centro_z: input.bbox.centroZ,
      p_ancho: input.bbox.ancho,
      p_alto: input.bbox.alto,
      p_nombre: input.nombre,
      p_audio_aislado: input.audioAislado,
    });
    if (error) {
      log.warn('Error designando area', { error: error.message });
      return mapearMotivoError(error);
    }
    return { ok: true, area: filaAArea(data as Record<string, unknown>) };
  }

  async asignar(areaId: string, usuarioId: string | null): Promise<ResultadoMutacionAreaEscritorio> {
    const { data, error } = await supabase.rpc('asignar_area_escritorio', {
      p_area_id: areaId,
      p_usuario_id: usuarioId,
    });
    if (error) {
      log.warn('Error asignando area', { error: error.message, areaId });
      return mapearMotivoError(error);
    }
    return { ok: true, area: filaAArea(data as Record<string, unknown>) };
  }

  async reasignar(areaId: string, nuevoUsuarioId: string | null): Promise<ResultadoMutacionAreaEscritorio> {
    const { data, error } = await supabase.rpc('reasignar_area_escritorio', {
      p_area_id: areaId,
      p_nuevo_usuario_id: nuevoUsuarioId,
    });
    if (error) {
      log.warn('Error reasignando area', { error: error.message, areaId });
      return mapearMotivoError(error);
    }
    return { ok: true, area: filaAArea(data as Record<string, unknown>) };
  }

  async eliminar(areaId: string): Promise<{ ok: boolean; motivo?: string }> {
    const { error } = await supabase.rpc('eliminar_area_escritorio', { p_area_id: areaId });
    if (error) {
      log.warn('Error eliminando area', { error: error.message, areaId });
      return { ok: false, motivo: error.message };
    }
    return { ok: true };
  }
}

export const areaEscritorioRepository = new AreaEscritorioSupabaseRepository();
