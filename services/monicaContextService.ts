/**
 * Servicio de Contexto para Mónica AI
 * Carga datos del usuario de forma progresiva (3 capas)
 * 
 * Capa 1: Contexto Inmediato (nombre, rol, workspace, canales, miembros) - siempre cargado
 * Capa 2: Contexto de Productividad (resúmenes AI, action items, reuniones) - lazy load
 * Capa 3: Contexto de Comportamiento (engagement, emociones, transcripciones) - bajo demanda
 * 
 * SEGURIDAD: Todo filtrado por usuario_id del usuario autenticado
 */

import { supabase } from '../lib/supabase';

export interface MeetingSummary {
  grabacion_id: string;
  resumen_corto: string;
  action_items: any[];
  puntos_clave: any[];
  sentimiento_general: string;
  fecha: string;
}

export interface BehaviorMetrics {
  engagement_promedio: number;
  emocion_dominante: string;
  total_reuniones_analizadas: number;
  emociones_frecuentes: Record<string, number>;
}

export interface ProductivityContext {
  resumenes: MeetingSummary[];
  actionItemsPendientes: string[];
  totalReuniones: number;
}

export interface BehaviorContext {
  metricas: BehaviorMetrics | null;
  ultimasTranscripciones: string[];
}

/**
 * Capa 2: Carga resúmenes AI y action items del usuario
 * Filtrado estrictamente por grabaciones.creado_por = userId
 */
export async function loadProductivityContext(
  userId: string,
  espacioId: string
): Promise<ProductivityContext> {
  try {
    const { data: grabaciones, error: grabError } = await supabase
      .from('grabaciones')
      .select('id, tipo, inicio_grabacion')
      .eq('creado_por', userId)
      .eq('espacio_id', espacioId)
      .order('inicio_grabacion', { ascending: false })
      .limit(10);

    if (grabError || !grabaciones?.length) {
      return { resumenes: [], actionItemsPendientes: [], totalReuniones: 0 };
    }

    const grabacionIds = grabaciones.map(g => g.id);

    const { data: resumenes } = await supabase
      .from('resumenes_ai')
      .select('grabacion_id, resumen_corto, action_items, puntos_clave, sentimiento_general, creado_en')
      .in('grabacion_id', grabacionIds)
      .order('creado_en', { ascending: false })
      .limit(5);

    const mappedResumenes: MeetingSummary[] = (resumenes || []).map(r => {
      const grab = grabaciones.find(g => g.id === r.grabacion_id);
      return {
        grabacion_id: r.grabacion_id,
        resumen_corto: r.resumen_corto || '',
        action_items: r.action_items || [],
        puntos_clave: r.puntos_clave || [],
        sentimiento_general: r.sentimiento_general || 'neutral',
        fecha: grab?.inicio_grabacion || r.creado_en,
      };
    });

    const actionItemsPendientes: string[] = [];
    for (const r of mappedResumenes) {
      if (Array.isArray(r.action_items)) {
        for (const item of r.action_items) {
          if (!item.completado) {
            actionItemsPendientes.push(item.tarea || item.task || item.description || '');
          }
        }
      }
    }

    return {
      resumenes: mappedResumenes,
      actionItemsPendientes: actionItemsPendientes.filter(Boolean).slice(0, 10),
      totalReuniones: grabaciones.length,
    };
  } catch (error) {
    console.error('Error loading productivity context:', error);
    return { resumenes: [], actionItemsPendientes: [], totalReuniones: 0 };
  }
}

/**
 * Capa 3: Carga métricas de comportamiento del usuario
 * Filtrado por participante_id = userId
 */
export async function loadBehaviorContext(
  userId: string,
  espacioId: string
): Promise<BehaviorContext> {
  try {
    const { data: grabaciones } = await supabase
      .from('grabaciones')
      .select('id')
      .eq('espacio_id', espacioId)
      .eq('creado_por', userId);

    if (!grabaciones?.length) {
      return { metricas: null, ultimasTranscripciones: [] };
    }

    const grabacionIds = grabaciones.map(g => g.id);

    const { data: analisis } = await supabase
      .from('analisis_comportamiento')
      .select('emocion_dominante, engagement_score, grabacion_id')
      .eq('participante_id', userId)
      .in('grabacion_id', grabacionIds)
      .order('creado_en', { ascending: false })
      .limit(50);

    let metricas: BehaviorMetrics | null = null;

    if (analisis?.length) {
      const engagementSum = analisis.reduce((sum, a) => sum + (Number(a.engagement_score) || 0), 0);
      const emocionesFrecuentes: Record<string, number> = {};

      for (const a of analisis) {
        if (a.emocion_dominante) {
          emocionesFrecuentes[a.emocion_dominante] = (emocionesFrecuentes[a.emocion_dominante] || 0) + 1;
        }
      }

      const emocionDominante = Object.entries(emocionesFrecuentes)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral';

      metricas = {
        engagement_promedio: Math.round((engagementSum / analisis.length) * 100) / 100,
        emocion_dominante: emocionDominante,
        total_reuniones_analizadas: new Set(analisis.map(a => a.grabacion_id)).size,
        emociones_frecuentes: emocionesFrecuentes,
      };
    }

    const { data: transcripciones } = await supabase
      .from('transcripciones')
      .select('texto, speaker_nombre')
      .in('grabacion_id', grabacionIds)
      .order('creado_en', { ascending: false })
      .limit(20);

    const ultimasTranscripciones = (transcripciones || [])
      .filter(t => t.texto && t.texto.length > 10)
      .slice(0, 10)
      .map(t => `${t.speaker_nombre || 'Participante'}: ${t.texto.slice(0, 150)}`);

    return { metricas, ultimasTranscripciones };
  } catch (error) {
    console.error('Error loading behavior context:', error);
    return { metricas: null, ultimasTranscripciones: [] };
  }
}

/**
 * Genera el bloque de contexto enriquecido para el system prompt
 * Limita a ~1500 tokens para no exceder el contexto
 */
export function buildEnrichedPrompt(
  productivity: ProductivityContext | null,
  behavior: BehaviorContext | null
): string {
  const sections: string[] = [];

  if (productivity?.resumenes?.length) {
    const resumenesText = productivity.resumenes
      .slice(0, 3)
      .map((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString('es');
        const puntos = Array.isArray(r.puntos_clave) ? r.puntos_clave.slice(0, 3).join(', ') : '';
        return `  ${i + 1}. [${fecha}] ${r.resumen_corto}${puntos ? ` | Puntos: ${puntos}` : ''} | Sentimiento: ${r.sentimiento_general}`;
      })
      .join('\n');
    sections.push(`[REUNIONES RECIENTES DEL USUARIO (${productivity.totalReuniones} total)]\n${resumenesText}`);
  }

  if (productivity?.actionItemsPendientes?.length) {
    const items = productivity.actionItemsPendientes
      .slice(0, 5)
      .map((item, i) => `  ${i + 1}. ${item}`)
      .join('\n');
    sections.push(`[ACTION ITEMS PENDIENTES]\n${items}`);
  }

  if (behavior?.metricas) {
    const m = behavior.metricas;
    sections.push(
      `[MÉTRICAS DE COMPORTAMIENTO EN REUNIONES]\n` +
      `  - Engagement promedio: ${Math.round(m.engagement_promedio * 100)}%\n` +
      `  - Emoción dominante: ${m.emocion_dominante}\n` +
      `  - Reuniones analizadas: ${m.total_reuniones_analizadas}`
    );
  }

  if (behavior?.ultimasTranscripciones?.length) {
    const trans = behavior.ultimasTranscripciones
      .slice(0, 5)
      .join('\n  ');
    sections.push(`[FRAGMENTOS DE TRANSCRIPCIONES RECIENTES]\n  ${trans}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return '\n\n--- DATOS PRIVADOS DEL USUARIO (solo de este usuario, nunca compartir con otros) ---\n' +
    sections.join('\n\n') +
    '\n--- FIN DATOS PRIVADOS ---';
}
