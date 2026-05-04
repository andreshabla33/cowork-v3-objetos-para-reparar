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

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ITerrenoRepository } from '@/src/core/domain/ports/ITerrenoRepository';
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
}
