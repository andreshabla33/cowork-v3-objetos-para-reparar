/**
 * Hook para generar resumen AI de reuniones usando Edge Function
 * Llama a OpenAI GPT-4o-mini y notifica al creador
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { AISummary, AISummaryState, TranscriptionSegment, EmotionAnalysis, BehaviorInsight } from './types';

interface UseAISummaryOptions {
  grabacionId: string;
  espacioId: string;
  creadorId: string;
  creadorNombre?: string;
  reunionTitulo?: string;
}

interface GenerateSummaryParams {
  transcripcion: string;
  segments?: TranscriptionSegment[];
  emociones?: EmotionAnalysis[];
  insights?: BehaviorInsight[];
  duracionSegundos: number;
  participantes?: string[];
}

export function useAISummary(options: UseAISummaryOptions) {
  const { grabacionId, espacioId, creadorId, creadorNombre, reunionTitulo } = options;

  const [state, setState] = useState<AISummaryState>({
    isLoading: false,
    error: null,
    summary: null,
  });

  const generateSummary = useCallback(async (params: GenerateSummaryParams): Promise<AISummary | null> => {
    const { transcripcion, segments, emociones, insights, duracionSegundos, participantes } = params;

    if (!transcripcion || transcripcion.trim().length < 10) {
      setState(prev => ({
        ...prev,
        error: 'Transcripción muy corta para generar resumen',
      }));
      return null;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabase.functions.invoke('generar-resumen-ai', {
        body: {
          grabacion_id: grabacionId,
          espacio_id: espacioId,
          creador_id: creadorId,
          transcripcion,
          emociones: emociones?.slice(-50),
          insights,
          duracion_segundos: duracionSegundos,
          participantes,
          reunion_titulo: reunionTitulo,
        },
      });

      if (error) throw error;

      const summary: AISummary = {
        id: data.id || crypto.randomUUID(),
        grabacion_id: grabacionId,
        resumen_corto: data.resumen_corto,
        resumen_detallado: data.resumen_detallado,
        puntos_clave: data.puntos_clave || [],
        action_items: data.action_items || [],
        sentimiento_general: data.sentimiento_general || 'neutral',
        duracion_reunion: duracionSegundos,
        participantes_activos: participantes?.length || 0,
        momentos_clave: data.momentos_clave || insights || [],
        metricas_conductuales: data.metricas_conductuales,
        modelo_usado: data.modelo_usado || 'gpt-4o-mini',
        tokens_usados: data.tokens_usados || 0,
        created_at: new Date().toISOString(),
      };

      await supabase.from('resumenes_ai').upsert({
        id: summary.id,
        grabacion_id: grabacionId,
        resumen_corto: summary.resumen_corto,
        resumen_detallado: summary.resumen_detallado,
        puntos_clave: summary.puntos_clave,
        action_items: summary.action_items,
        sentimiento_general: summary.sentimiento_general,
        momentos_clave: summary.momentos_clave,
        metricas_conductuales: summary.metricas_conductuales,
        modelo_usado: summary.modelo_usado,
        tokens_usados: summary.tokens_usados,
      });

      await supabase.from('notificaciones').insert({
        usuario_id: creadorId,
        espacio_id: espacioId,
        tipo: 'resumen_listo',
        titulo: '📝 Resumen de reunión listo',
        mensaje: reunionTitulo 
          ? `El resumen de "${reunionTitulo}" está disponible`
          : 'El resumen de tu reunión está disponible',
        entidad_tipo: 'grabacion',
        entidad_id: grabacionId,
        datos_extra: {
          action_items_count: summary.action_items.length,
          puntos_clave_count: summary.puntos_clave.length,
        },
      });

      setState({ isLoading: false, error: null, summary });
      console.log('✅ Resumen AI generado y notificación enviada');

      return summary;

    } catch (err: any) {
      console.error('Error generando resumen:', err);
      const errorMsg = err.message || 'Error al generar resumen AI';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));

      await supabase.from('notificaciones').insert({
        usuario_id: creadorId,
        espacio_id: espacioId,
        tipo: 'error_procesamiento',
        titulo: '⚠️ Error en procesamiento',
        mensaje: 'No se pudo generar el resumen de la reunión',
        entidad_tipo: 'grabacion',
        entidad_id: grabacionId,
      });

      return null;
    }
  }, [grabacionId, espacioId, creadorId, reunionTitulo]);

  const loadExistingSummary = useCallback(async (): Promise<AISummary | null> => {
    try {
      const { data, error } = await supabase
        .from('resumenes_ai')
        .select('*')
        .eq('grabacion_id', grabacionId)
        .single();

      if (error || !data) return null;

      const summary: AISummary = {
        id: data.id,
        grabacion_id: data.grabacion_id,
        resumen_corto: data.resumen_corto,
        resumen_detallado: data.resumen_detallado,
        puntos_clave: data.puntos_clave || [],
        action_items: data.action_items || [],
        sentimiento_general: data.sentimiento_general,
        duracion_reunion: 0,
        participantes_activos: 0,
        momentos_clave: data.momentos_clave || [],
        metricas_conductuales: data.metricas_conductuales,
        modelo_usado: data.modelo_usado,
        tokens_usados: data.tokens_usados,
        created_at: data.created_at,
      };

      setState(prev => ({ ...prev, summary }));
      return summary;

    } catch (err) {
      console.error('Error cargando resumen:', err);
      return null;
    }
  }, [grabacionId]);

  return {
    state,
    generateSummary,
    loadExistingSummary,
    isLoading: state.isLoading,
    summary: state.summary,
    error: state.error,
  };
}

export default useAISummary;
