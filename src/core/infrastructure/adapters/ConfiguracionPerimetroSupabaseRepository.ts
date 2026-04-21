/**
 * @module infrastructure/adapters/ConfiguracionPerimetroSupabaseRepository
 *
 * Clean Architecture — Infrastructure adapter.
 *
 * Persiste PerimeterPolicy en la tabla dedicada `espacio_configuracion_perimetro`
 * con CHECK constraints a nivel DB + RLS por rol admin. Reemplaza el patrón
 * JSONB en `espacios_trabajo.configuracion` que usábamos antes.
 *
 * Ref oficial Supabase: https://supabase.com/docs/guides/database/json
 *   "Don't go overboard with json/jsonb columns... for well-defined settings
 *    use dedicated tables (better filtering + referential integrity)."
 *
 * Seguridad: RLS controla quién puede INSERT/UPDATE/DELETE (solo admins).
 * SELECT es abierto a miembros del espacio (aceptado=true).
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { IConfiguracionPerimetroRepository } from '@/src/core/domain/ports/IConfiguracionPerimetroRepository';
import type { PerimeterPolicy } from '@/src/core/domain/entities/espacio3d/PerimeterPolicy';

const log = logger.child('configuracion-perimetro-repo');
const TABLE = 'espacio_configuracion_perimetro';

// Mapeo snake_case (DB) ↔ camelCase (domain). Pequeño, sin overhead ORM.
interface DBRow {
  espacio_id: string;
  enabled: boolean;
  style: string;
  height: number;
  segment_width: number;
  margin: number;
}

function rowToPolicy(row: DBRow): PerimeterPolicy {
  return {
    enabled: row.enabled,
    style: row.style as PerimeterPolicy['style'],
    height: Number(row.height),
    segmentWidth: Number(row.segment_width),
    margin: Number(row.margin),
  };
}

function policyToRow(espacioId: string, policy: PerimeterPolicy): DBRow {
  return {
    espacio_id: espacioId,
    enabled: policy.enabled,
    style: policy.style,
    height: policy.height,
    segment_width: policy.segmentWidth,
    margin: policy.margin,
  };
}

export class ConfiguracionPerimetroSupabaseRepository
  implements IConfiguracionPerimetroRepository
{
  async obtener(espacioId: string): Promise<PerimeterPolicy | null> {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('espacio_id', espacioId)
        .maybeSingle();
      if (error) {
        log.warn('Failed to read perimeter config', { espacioId, error: error.message });
        return null;
      }
      if (!data) return null;
      return rowToPolicy(data as DBRow);
    } catch (err) {
      log.warn('Exception reading perimeter', {
        espacioId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async actualizar(espacioId: string, policy: PerimeterPolicy): Promise<void> {
    // UPSERT para crear el row si no existe (primer cambio del admin) o
    // actualizar si ya existe. `on_conflict=espacio_id` aprovecha la PK.
    const { error } = await supabase
      .from(TABLE)
      .upsert(policyToRow(espacioId, policy), { onConflict: 'espacio_id' });
    if (error) {
      log.warn('Failed to upsert perimeter', { espacioId, error: error.message });
      throw error;
    }
    log.info('Perimeter config persisted', { espacioId, policy });
  }

  subscribe(
    espacioId: string,
    onChange: (policy: PerimeterPolicy) => void,
  ): () => void {
    // Realtime: escuchamos INSERT+UPDATE de la fila específica. Filtro
    // server-side por `espacio_id=eq.<id>` evita tráfico innecesario.
    // Ref: https://supabase.com/docs/guides/realtime/postgres-changes
    const channel = supabase
      .channel(`perimetro-config:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE
          schema: 'public',
          table: TABLE,
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Caller decide — pasamos null no aplica al contrato. Se ignora:
            // si alguien borra, el próximo load (manual refresh) retornará null
            // y el fallback al default aplica.
            return;
          }
          const row = payload.new as DBRow | null;
          if (row) onChange(rowToPolicy(row));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
