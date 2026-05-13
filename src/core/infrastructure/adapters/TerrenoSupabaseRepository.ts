/**
 * @module infrastructure/adapters/TerrenoSupabaseRepository
 *
 * Clean Architecture — Infrastructure adapter.
 *
 * Persiste el terreno (suelo + montañas + ríos) en la tabla `espacio_terreno`
 * (1:1 con `espacios_trabajo`). RLS controla escritura: solo
 * owner/admin/super_admin del espacio. Lectura abierta a miembros aceptados.
 *
 * Migración: supabase/migrations/20260504_terreno_rios.sql
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  EventoTerreno,
  ITerrenoRepository,
} from '@/src/core/domain/ports/ITerrenoRepository';
import type {
  TerrenoEntity,
  EscalaTerreno,
  ZonaAgua,
  TipoTerreno,
} from '@/src/core/domain/entities/espacio3d/TerrenoEntity';

const log = logger.child('terreno-repo');
const TABLE = 'espacio_terreno';

interface DBRow {
  id: string;
  espacio_id: string;
  tipo: TipoTerreno;
  heightmap_url: string | null;
  nrows: number | null;
  ncols: number | null;
  scale_xyz: EscalaTerreno;
  zonas_agua: ZonaAgua[];
  tipo_suelo_principal: string | null;
  configuracion: Record<string, unknown>;
}

function rowToEntity(row: DBRow): TerrenoEntity {
  return {
    id: row.id,
    espacioId: row.espacio_id,
    tipo: row.tipo,
    heightmapUrl: row.heightmap_url,
    nrows: row.nrows,
    ncols: row.ncols,
    escala: row.scale_xyz,
    zonasAgua: row.zonas_agua ?? [],
    tipoSueloPrincipal: row.tipo_suelo_principal ?? 'concrete_smooth',
    configuracion: row.configuracion ?? {},
  };
}

function entityToInsert(terreno: Omit<TerrenoEntity, 'id'>): Omit<DBRow, 'id'> {
  return {
    espacio_id: terreno.espacioId,
    tipo: terreno.tipo,
    heightmap_url: terreno.heightmapUrl,
    nrows: terreno.nrows,
    ncols: terreno.ncols,
    scale_xyz: terreno.escala,
    zonas_agua: terreno.zonasAgua,
    tipo_suelo_principal: terreno.tipoSueloPrincipal,
    configuracion: terreno.configuracion,
  };
}

export class TerrenoSupabaseRepository implements ITerrenoRepository {
  async obtener(espacioId: string): Promise<TerrenoEntity | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('espacio_id', espacioId)
      .maybeSingle();

    if (error) {
      log.error('obtener: error de supabase', { espacioId, error: error.message });
      throw error;
    }
    return data ? rowToEntity(data as DBRow) : null;
  }

  async guardar(terreno: Omit<TerrenoEntity, 'id'>): Promise<TerrenoEntity> {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(entityToInsert(terreno), { onConflict: 'espacio_id' })
      .select()
      .single();

    if (error) {
      log.error('guardar: error de supabase', {
        espacioId: terreno.espacioId,
        error: error.message,
      });
      throw error;
    }
    return rowToEntity(data as DBRow);
  }

  async eliminar(espacioId: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('espacio_id', espacioId);

    if (error) {
      log.error('eliminar: error de supabase', { espacioId, error: error.message });
      throw error;
    }
  }

  /**
   * Suscribe a cambios Realtime del terreno de un espacio.
   *
   * Sufijo único en el nombre del canal por instancia → evita el error
   * "cannot add postgres_changes callbacks after subscribe()" cuando el
   * hook `useTerreno` se monta múltiples veces (Scene3D + Settings tab).
   * El filtro `espacio_id=eq.X` garantiza que cada canal recibe lo mismo.
   *
   * Ref: https://supabase.com/docs/guides/realtime/concepts#channels
   */
  suscribirCambios(
    espacioId: string,
    callback: (evento: EventoTerreno) => void,
  ): () => void {
    const sufijo = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`espacio_terreno:${espacioId}:${sufijo}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              callback({ tipo: 'INSERT', terreno: rowToEntity(payload.new as DBRow) });
            } else if (payload.eventType === 'UPDATE') {
              callback({ tipo: 'UPDATE', terreno: rowToEntity(payload.new as DBRow) });
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { espacio_id?: string };
              callback({ tipo: 'DELETE', espacioId: oldRow.espacio_id ?? espacioId });
            }
          } catch (err) {
            log.warn('Payload realtime inválido', {
              event: payload.eventType,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }
}
