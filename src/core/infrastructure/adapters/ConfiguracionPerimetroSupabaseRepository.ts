/**
 * @module infrastructure/adapters/ConfiguracionPerimetroSupabaseRepository
 *
 * Clean Architecture — Infrastructure adapter (implementa port del Domain).
 *
 * Persiste PerimeterPolicy en la columna `espacios_trabajo.configuracion`
 * (JSONB existente, default `{}`) bajo la key `perimeter`. NO crea tabla
 * nueva ni requiere migración — reusa la columna ya disponible.
 *
 * Ejemplo de fila:
 *   {
 *     "perimeter": {
 *       "enabled": true,
 *       "style": "glass",
 *       "height": 3,
 *       "segmentWidth": 4,
 *       "margin": 0.5
 *     },
 *     ...otras configs del espacio...
 *   }
 *
 * Seguridad: el enforcement de "solo admin puede actualizar" vive en RLS
 * de Supabase (tabla `espacios_trabajo`). El cliente llama sin ceremonia;
 * si un user sin permisos intenta UPDATE, la DB rechaza silenciosamente.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { IConfiguracionPerimetroRepository } from '@/src/core/domain/ports/IConfiguracionPerimetroRepository';
import type { PerimeterPolicy } from '@/src/core/domain/entities/espacio3d/ScenePolicy';

const log = logger.child('configuracion-perimetro-repo');

export class ConfiguracionPerimetroSupabaseRepository
  implements IConfiguracionPerimetroRepository
{
  async obtener(espacioId: string): Promise<PerimeterPolicy | null> {
    try {
      const { data, error } = await supabase
        .from('espacios_trabajo')
        .select('configuracion')
        .eq('id', espacioId)
        .maybeSingle();
      if (error) {
        log.warn('Failed to read configuracion', { espacioId, error: error.message });
        return null;
      }
      const config = (data?.configuracion ?? {}) as Record<string, unknown>;
      const perimeter = config.perimeter as PerimeterPolicy | undefined;
      return perimeter ?? null;
    } catch (err) {
      log.warn('Exception reading perimeter', {
        espacioId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async actualizar(espacioId: string, policy: PerimeterPolicy): Promise<void> {
    // Primero leemos la config actual para no pisar otras keys.
    const { data: fila, error: readErr } = await supabase
      .from('espacios_trabajo')
      .select('configuracion')
      .eq('id', espacioId)
      .maybeSingle();
    if (readErr) {
      log.warn('Read failed before update', { espacioId, error: readErr.message });
      throw readErr;
    }
    const configActual = (fila?.configuracion ?? {}) as Record<string, unknown>;
    const configNueva = { ...configActual, perimeter: policy };

    const { error } = await supabase
      .from('espacios_trabajo')
      .update({ configuracion: configNueva })
      .eq('id', espacioId);
    if (error) {
      log.warn('Failed to update perimeter', { espacioId, error: error.message });
      throw error;
    }
    log.info('Perimeter config updated', { espacioId, policy });
  }

  subscribe(
    espacioId: string,
    onChange: (policy: PerimeterPolicy) => void,
  ): () => void {
    // Supabase Realtime: escuchamos updates de la fila específica. Filtro
    // server-side por `id=eq.<espacioId>` evita tráfico innecesario.
    // Ref: https://supabase.com/docs/guides/realtime/postgres-changes
    const channel = supabase
      .channel(`espacio-config-perimeter:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'espacios_trabajo',
          filter: `id=eq.${espacioId}`,
        },
        (payload) => {
          const nueva = (payload.new as { configuracion?: Record<string, unknown> } | null)
            ?.configuracion;
          const perimeter = nueva?.perimeter as PerimeterPolicy | undefined;
          if (perimeter) onChange(perimeter);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
