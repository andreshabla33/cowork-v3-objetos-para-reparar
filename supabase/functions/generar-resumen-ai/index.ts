/**
 * Edge Function: generar-resumen-ai
 * Genera resumen de reuniones usando OpenAI GPT-4o-mini
 * Incluye action items, puntos clave y análisis de sentimiento
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'http://localhost:3000',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

interface RequestBody {
  grabacion_id: string;
  espacio_id: string;
  creador_id: string;
  transcripcion: string;
  emociones?: any[];
  insights?: any[];
  duracion_segundos: number;
  participantes?: string[];
  reunion_titulo?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }

    const body: RequestBody = await req.json();
    const {
      grabacion_id,
      espacio_id,
      creador_id,
      transcripcion,
      emociones,
      insights,
      duracion_segundos,
      participantes,
      reunion_titulo,
    } = body;

    if (!transcripcion || transcripcion.length < 10) {
      throw new Error('Transcripción muy corta para generar resumen');
    }

    const engagementPromedio = emociones?.length
      ? emociones.reduce((sum, e) => sum + (e.engagement_score || 0), 0) / emociones.length
      : null;

    const emocionDominante = emociones?.length
      ? getMostFrequent(emociones.map(e => e.emocion_dominante))
      : null;

    const systemPrompt = `Eres un asistente experto en análisis de reuniones de trabajo.
Tu tarea es generar un resumen estructurado de la reunión basándote en la transcripción.

IMPORTANTE:
- Responde SOLO en formato JSON válido
- El resumen debe ser conciso pero completo
- Identifica todas las tareas/action items mencionados
- Extrae los puntos clave de la discusión
- Analiza el sentimiento general

Formato de respuesta JSON:
{
  "resumen_corto": "Resumen de 1-2 oraciones",
  "resumen_detallado": "Resumen de 3-5 oraciones con más detalle",
  "puntos_clave": ["punto 1", "punto 2", ...],
  "action_items": [
    {
      "tarea": "Descripción de la tarea",
      "responsable": "Nombre si se menciona o null",
      "prioridad": "alta|media|baja"
    }
  ],
  "sentimiento_general": "positivo|neutral|negativo|mixto",
  "temas_principales": ["tema1", "tema2"]
}`;

    const userPrompt = `Analiza la siguiente transcripción de reunión${reunion_titulo ? ` titulada "${reunion_titulo}"` : ''}:

TRANSCRIPCIÓN:
${transcripcion.slice(0, 8000)}

${participantes?.length ? `PARTICIPANTES: ${participantes.join(', ')}` : ''}
${duracion_segundos ? `DURACIÓN: ${Math.round(duracion_segundos / 60)} minutos` : ''}
${engagementPromedio !== null ? `ENGAGEMENT PROMEDIO: ${Math.round(engagementPromedio * 100)}%` : ''}
${emocionDominante ? `EMOCIÓN PREDOMINANTE: ${emocionDominante}` : ''}

Genera el análisis en formato JSON.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI error:', error);
      throw new Error('Error al comunicarse con OpenAI');
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;
    const tokensUsados = openaiData.usage?.total_tokens || 0;

    if (!content) {
      throw new Error('Respuesta vacía de OpenAI');
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch {
      console.error('Error parseando JSON:', content);
      parsedContent = {
        resumen_corto: content.slice(0, 200),
        resumen_detallado: content,
        puntos_clave: [],
        action_items: [],
        sentimiento_general: 'neutral',
      };
    }

    const actionItems = (parsedContent.action_items || []).map((item: any, index: number) => ({
      id: `action_${grabacion_id}_${index}`,
      tarea: item.tarea || item.task || item.description || 'Tarea sin descripción',
      responsable: item.responsable || item.assignee || null,
      prioridad: item.prioridad || item.priority || 'media',
      completado: false,
    }));

    const result = {
      id: crypto.randomUUID(),
      grabacion_id,
      resumen_corto: parsedContent.resumen_corto || '',
      resumen_detallado: parsedContent.resumen_detallado || parsedContent.resumen_corto || '',
      puntos_clave: parsedContent.puntos_clave || parsedContent.temas_principales || [],
      action_items: actionItems,
      sentimiento_general: parsedContent.sentimiento_general || 'neutral',
      momentos_clave: insights || [],
      metricas_conductuales: engagementPromedio !== null ? {
        engagement_promedio: engagementPromedio,
        emocion_dominante: emocionDominante,
      } : null,
      modelo_usado: 'gpt-4o-mini',
      tokens_usados: tokensUsados,
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('grabaciones').update({
      estado: 'completed',
    }).eq('id', grabacion_id);

    console.log(`✅ Resumen generado para grabación ${grabacion_id}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[generar-resumen-ai] Error interno:', error.message);
    return new Response(
      JSON.stringify({ error: 'Error interno al generar resumen' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function getMostFrequent(arr: string[]): string {
  const counts: Record<string, number> = {};
  arr.forEach(item => {
    if (item) counts[item] = (counts[item] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
}
