/**
 * Servicio centralizado para gestión de métricas de análisis conductual por espacio.
 * Lee/escribe en tabla `configuracion_metricas_espacio` de Supabase.
 * Mantiene cache en memoria para acceso síncrono desde RecordingManager.
 * 
 * Flujo:
 * 1. Al cargar el espacio → cargarMetricasEspacio(espacioId)
 * 2. Settings UI lee/escribe via getMetricasActivas / guardarMetricasEspacio
 * 3. RecordingManager lee via getMetricasCached (síncrono, desde cache)
 */

import { supabase } from './supabase';

export type TipoAnalisis = 'rrhh_entrevista' | 'rrhh_one_to_one' | 'deals' | 'equipo';

// ==================== DEFAULTS (mismos que CONFIGURACIONES_GRABACION_DETALLADO) ====================

export const METRICAS_DEFAULT: Record<TipoAnalisis, string[]> = {
  rrhh_entrevista: [
    'congruencia_verbal_no_verbal',
    'nivel_nerviosismo',
    'confianza_percibida',
    'engagement_por_pregunta',
    'momentos_incomodidad',
    'prediccion_fit_cultural',
  ],
  rrhh_one_to_one: [
    'congruencia_verbal_no_verbal',
    'nivel_comodidad',
    'engagement_por_tema',
    'momentos_preocupacion',
    'señales_satisfaccion',
    'apertura_comunicacion',
  ],
  deals: [
    'momentos_interes',
    'señales_objecion',
    'engagement_por_tema',
    'señales_cierre',
    'prediccion_probabilidad_cierre',
    'puntos_dolor_detectados',
  ],
  equipo: [
    'participacion_por_persona',
    'engagement_grupal',
    'reacciones_a_ideas',
    'momentos_desconexion',
    'dinamica_grupal',
    'prediccion_adopcion_ideas',
  ],
};

// ==================== CACHE EN MEMORIA ====================

interface CacheEntry {
  espacioId: string;
  metricas: Record<TipoAnalisis, string[]>;
  loadedAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function isCacheValid(espacioId: string): boolean {
  if (!_cache) return false;
  if (_cache.espacioId !== espacioId) return false;
  if (Date.now() - _cache.loadedAt > CACHE_TTL_MS) return false;
  return true;
}

// ==================== LECTURA ====================

/**
 * Carga las métricas del espacio desde Supabase y las guarda en cache.
 * Llamar al iniciar sesión o al cambiar de espacio.
 */
export async function cargarMetricasEspacio(espacioId: string): Promise<Record<TipoAnalisis, string[]>> {
  try {
    const { data, error } = await supabase
      .from('configuracion_metricas_espacio')
      .select('tipo_analisis, metricas_activas')
      .eq('espacio_id', espacioId);

    if (error) {
      console.warn('⚠️ Error cargando métricas de espacio:', error.message);
      return { ...METRICAS_DEFAULT };
    }

    // Merge: lo que viene de BD + defaults para tipos sin configurar
    const resultado: Record<TipoAnalisis, string[]> = { ...METRICAS_DEFAULT };

    if (data && data.length > 0) {
      for (const row of data) {
        const tipo = row.tipo_analisis as TipoAnalisis;
        if (tipo in resultado && Array.isArray(row.metricas_activas) && row.metricas_activas.length > 0) {
          resultado[tipo] = row.metricas_activas;
        }
      }
    }

    // Guardar en cache
    _cache = {
      espacioId,
      metricas: resultado,
      loadedAt: Date.now(),
    };

    console.log('✅ Métricas de análisis cargadas para espacio:', espacioId);
    return resultado;
  } catch (err) {
    console.warn('⚠️ Error inesperado cargando métricas:', err);
    return { ...METRICAS_DEFAULT };
  }
}

/**
 * Obtiene métricas desde cache (síncrono). 
 * Si no hay cache, devuelve defaults.
 * Usado por RecordingManager/getConfiguracionConMetricasCustom.
 */
export function getMetricasCached(tipo: TipoAnalisis, espacioId?: string): string[] {
  // Si hay cache válida, usarla
  if (espacioId && isCacheValid(espacioId) && _cache) {
    return _cache.metricas[tipo] || METRICAS_DEFAULT[tipo];
  }
  
  // Si hay cache aunque sea de otro espacio o expirada, usarla como fallback
  if (_cache?.metricas[tipo]) {
    return _cache.metricas[tipo];
  }

  return METRICAS_DEFAULT[tipo];
}

/**
 * Obtiene todas las métricas de todos los tipos desde cache.
 */
export function getTodasMetricasCached(espacioId?: string): Record<TipoAnalisis, string[]> {
  if (espacioId && isCacheValid(espacioId) && _cache) {
    return { ..._cache.metricas };
  }
  if (_cache?.metricas) {
    return { ..._cache.metricas };
  }
  return { ...METRICAS_DEFAULT };
}

// ==================== ESCRITURA ====================

/**
 * Guarda las métricas de un tipo para un espacio en Supabase.
 * Usa UPSERT (insert on conflict update).
 */
export async function guardarMetricasEspacio(
  espacioId: string,
  tipo: TipoAnalisis,
  metricas: string[],
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('configuracion_metricas_espacio')
      .upsert(
        {
          espacio_id: espacioId,
          tipo_analisis: tipo,
          metricas_activas: metricas,
          actualizado_por: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'espacio_id,tipo_analisis' }
      );

    if (error) {
      console.error('❌ Error guardando métricas:', error.message);
      return false;
    }

    // Actualizar cache local
    if (_cache && _cache.espacioId === espacioId) {
      _cache.metricas[tipo] = metricas;
      _cache.loadedAt = Date.now();
    } else {
      // Crear cache nueva
      _cache = {
        espacioId,
        metricas: { ...METRICAS_DEFAULT, [tipo]: metricas },
        loadedAt: Date.now(),
      };
    }

    console.log(`✅ Métricas guardadas para ${tipo} en espacio ${espacioId}`);
    return true;
  } catch (err) {
    console.error('❌ Error inesperado guardando métricas:', err);
    return false;
  }
}

/**
 * Guarda todas las métricas de todos los tipos para un espacio.
 */
export async function guardarTodasMetricasEspacio(
  espacioId: string,
  metricas: Record<TipoAnalisis, string[]>,
  userId: string
): Promise<boolean> {
  const tipos: TipoAnalisis[] = ['rrhh_entrevista', 'rrhh_one_to_one', 'deals', 'equipo'];
  
  const rows = tipos.map(tipo => ({
    espacio_id: espacioId,
    tipo_analisis: tipo,
    metricas_activas: metricas[tipo] || METRICAS_DEFAULT[tipo],
    actualizado_por: userId,
    updated_at: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase
      .from('configuracion_metricas_espacio')
      .upsert(rows, { onConflict: 'espacio_id,tipo_analisis' });

    if (error) {
      console.error('❌ Error guardando todas las métricas:', error.message);
      return false;
    }

    // Actualizar cache
    _cache = {
      espacioId,
      metricas: { ...metricas },
      loadedAt: Date.now(),
    };

    console.log('✅ Todas las métricas guardadas para espacio:', espacioId);
    return true;
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    return false;
  }
}

/**
 * Invalida el cache (llamar al cambiar de espacio).
 */
export function invalidarCacheMetricas(): void {
  _cache = null;
}
