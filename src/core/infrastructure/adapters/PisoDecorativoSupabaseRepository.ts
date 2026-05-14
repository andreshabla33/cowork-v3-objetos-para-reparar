/**
 * @module infrastructure/adapters/PisoDecorativoSupabaseRepository
 * @description Supabase adapter para IPisoDecorativoRepository.
 *
 * Tabla: `zona_pisos_decorativos`.
 * RPCs:
 *   - crear_piso_decorativo(...)
 *   - eliminar_piso_decorativo(p_piso_id)
 * Realtime: postgres_changes filtered by espacio_id.
 *
 * ## Local broadcast (2026-05-14)
 * Mantenemos un registry module-level de TODOS los subscribers activos
 * en el tab. Tras un RPC exitoso (crear / eliminar), sintetizamos un
 * evento INSERT/DELETE y lo enviamos a cada subscriber local **antes**
 * de que llegue (si llega) el echo de Supabase Realtime.
 *
 * Motivo: el realtime channel puede tener `Heartbeat timeout` o
 * `Global discovery channel TIMED_OUT` por problemas de red/SFU/RLS,
 * dejando UI desincronizada. Para la tab que disparó la mutación, ya
 * sabemos el resultado — no hay razón para esperar el echo. Otros tabs
 * siguen recibiendo via realtime.
 *
 * Cuando Supabase Realtime sí entrega el evento, el reducer del hook
 * es idempotente (filter/upsert por id) → no hay doble-aplicación.
 *
 * Refs:
 *  - https://supabase.com/docs/reference/javascript/rpc
 *  - https://supabase.com/docs/guides/realtime/postgres-changes
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import { normalizarTipoSuelo } from '@/core/domain/entities/tiposSuelo';
import type { PisoDecorativo, CrearPisoDecorativoInput } from '@/core/domain/entities/espacio3d/PisoDecorativo';
import type {
  IPisoDecorativoRepository,
  EventoPisoDecorativo,
  ResultadoMutacionPisoDecorativo,
} from '@/core/domain/ports/IPisoDecorativoRepository';

const log = logger.child('piso-decorativo-repository');

function filaAPiso(row: Record<string, unknown>): PisoDecorativo {
  return {
    id: String(row.id),
    espacioId: String(row.espacio_id),
    zonaId: (row.zona_id as string | null) ?? null,
    tipoSuelo: normalizarTipoSuelo(row.tipo_suelo as string | null),
    centroX: Number(row.centro_x),
    centroZ: Number(row.centro_z),
    ancho: Number(row.ancho),
    profundidad: Number(row.profundidad),
    rotacionY: Number(row.rotacion_y ?? 0),
    orden: Number(row.orden ?? 0),
    ownerId: (row.owner_id as string | null) ?? null,
    creadoEn: String(row.creado_en),
    actualizadoEn: String(row.actualizado_en),
  };
}

function mapearMotivoError(err: { message?: string; details?: string; code?: string } | null | undefined): ResultadoMutacionPisoDecorativo {
  const haystack = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`.toUpperCase();
  if (haystack.includes('NO_AUTORIZADO')) return { ok: false, motivo: 'no_autorizado' };
  if (haystack.includes('BBOX_INVALIDO')) return { ok: false, motivo: 'bbox_invalido' };
  if (haystack.includes('TIPO_SUELO_VACIO')) return { ok: false, motivo: 'bbox_invalido' };
  return { ok: false, motivo: 'error' };
}

// Module-level registry de subscribers locales (por tab).
// Cada Set vive el ciclo de vida del módulo (singleton). Se limpia via
// el `unsub` returnado por `suscribirCambios`.
const localSubscribers = new Set<(evento: EventoPisoDecorativo) => void>();

function broadcastLocal(evento: EventoPisoDecorativo): void {
  for (const cb of localSubscribers) {
    try {
      cb(evento);
    } catch (err) {
      log.warn('Error en local subscriber', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export class PisoDecorativoSupabaseRepository implements IPisoDecorativoRepository {
  async listarPorEspacio(espacioId: string): Promise<PisoDecorativo[]> {
    const { data, error } = await supabase
      .from('zona_pisos_decorativos')
      .select('*')
      .eq('espacio_id', espacioId)
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: true });
    if (error) {
      log.error('Error listando pisos decorativos', { error: error.message, espacioId });
      throw error;
    }
    return (data ?? []).map((row) => filaAPiso(row as Record<string, unknown>));
  }

  suscribirCambios(espacioId: string, callback: (evento: EventoPisoDecorativo) => void): () => void {
    // Registro local: el repo notifica a este callback tras mutaciones
    // exitosas en este mismo tab, sin esperar el echo de realtime.
    localSubscribers.add(callback);

    const sufijoInstancia = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`zona_pisos_decorativos:${espacioId}:${sufijoInstancia}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'zona_pisos_decorativos',
        filter: `espacio_id=eq.${espacioId}`,
      }, (payload) => {
        try {
          if (payload.eventType === 'INSERT') {
            callback({ tipo: 'INSERT', piso: filaAPiso(payload.new as Record<string, unknown>) });
          } else if (payload.eventType === 'UPDATE') {
            callback({ tipo: 'UPDATE', piso: filaAPiso(payload.new as Record<string, unknown>) });
          } else if (payload.eventType === 'DELETE') {
            callback({ tipo: 'DELETE', piso: filaAPiso(payload.old as Record<string, unknown>) });
          }
        } catch (err) {
          log.warn('Payload realtime inválido', {
            event: payload.eventType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .subscribe();

    return () => {
      localSubscribers.delete(callback);
      supabase.removeChannel(channel);
    };
  }

  async crear(input: CrearPisoDecorativoInput): Promise<ResultadoMutacionPisoDecorativo> {
    const { data, error } = await supabase.rpc('crear_piso_decorativo', {
      p_espacio_id: input.espacioId,
      p_zona_id: input.zonaId,
      p_tipo_suelo: input.tipoSuelo,
      p_centro_x: input.centroX,
      p_centro_z: input.centroZ,
      p_ancho: input.ancho,
      p_profundidad: input.profundidad,
      p_rotacion_y: input.rotacionY ?? 0,
      p_orden: input.orden ?? 0,
    });
    if (error) {
      log.warn('Error creando piso decorativo', { error: error.message });
      return mapearMotivoError(error);
    }
    const piso = filaAPiso(data as Record<string, unknown>);
    // Optimistic local broadcast — no esperamos echo de realtime.
    broadcastLocal({ tipo: 'INSERT', piso });
    return { ok: true, piso };
  }

  async eliminar(pisoId: string): Promise<{ ok: boolean; motivo?: string }> {
    const { error } = await supabase.rpc('eliminar_piso_decorativo', { p_piso_id: pisoId });
    if (error) {
      log.warn('Error eliminando piso decorativo', { error: error.message, pisoId });
      return { ok: false, motivo: error.message };
    }
    // Optimistic local broadcast — fabricamos un PisoDecorativo mínimo con
    // solo el id (que es lo único que el reducer DELETE usa para filtrar).
    // Los demás campos son placeholders inocuos.
    broadcastLocal({
      tipo: 'DELETE',
      piso: {
        id: pisoId,
        espacioId: '',
        zonaId: null,
        tipoSuelo: 'concrete_smooth' as PisoDecorativo['tipoSuelo'],
        centroX: 0,
        centroZ: 0,
        ancho: 0,
        profundidad: 0,
        rotacionY: 0,
        orden: 0,
        ownerId: null,
        creadoEn: '',
        actualizadoEn: '',
      },
    });
    return { ok: true };
  }
}

export const pisoDecorativoRepository = new PisoDecorativoSupabaseRepository();
