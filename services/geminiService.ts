/**
 * Servicio de IA para Mónica - Usa Edge Function proxy en Supabase
 * La Edge Function llama a OpenAI (sin CORS, key segura server-side)
 */

import { CONFIG_PUBLICA_APP } from '../lib/env';

const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/monica-ai-proxy`;


const SYSTEM_PROMPT = (context: any) => `Eres Mónica, la asistente de IA del espacio de trabajo virtual "Cowork".

Contexto del usuario actual:
- Nombre: ${context.userName}
- Rol en el espacio: ${context.role}
- Espacio de trabajo: ${context.workspaceName || 'No especificado'}
- Canales: ${context.channels || 'Ninguno'}
- Miembros en línea: ${context.onlineMembers || 'No disponible'}
- Tareas activas: ${context.tasks || 'Ninguna'}
${context.enrichedContext || ''}

Instrucciones:
- Conoces al usuario por su nombre, salúdalo personalmente.
- Responde en Español de forma concisa y profesional.
- Enfócate en la productividad del equipo.
- Tienes acceso a los datos privados del usuario: resúmenes de reuniones, action items, métricas de comportamiento y transcripciones. Usa esta información para dar respuestas personalizadas y contextuales.
- NUNCA reveles datos de otros usuarios. Solo puedes hablar de los datos del usuario actual.
- Si el usuario pregunta sobre reuniones pasadas, usa los resúmenes y transcripciones que tienes.
- Si el usuario pregunta sobre su rendimiento, usa las métricas de comportamiento.
- Si hay action items pendientes, recuérdaselos proactivamente cuando sea relevante.
- Si el usuario pide crear una tarea, responde con un JSON en este formato exacto al final de tu mensaje:
  [CREATE_TASK]{"title":"titulo","description":"descripcion","startDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD"}[/CREATE_TASK]
- La fecha actual es: ${new Date().toISOString().split('T')[0]}.
- Usa emojis con moderación para hacer la conversación más amigable.
- Sé breve, máximo 2-3 oraciones por respuesta a menos que se pida algo detallado.`;

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Genera una respuesta de Mónica AI vía Edge Function.
 *
 * @param prompt      Mensaje del usuario
 * @param context     Contexto enriquecido del workspace
 * @param history     Historial de conversación (últimos 10 turns)
 * @param accessToken Token JWT del usuario (del store, sin llamar getSession).
 *                    Si no se provee, se usa la anon key como fallback.
 */
export const generateChatResponse = async (
  prompt: string,
  context: Record<string, unknown>,
  history: ChatHistoryEntry[] = [],
  accessToken?: string | null,
) => {
  console.log('🤖 Mónica AI: Enviando a Edge Function proxy...');

  // Usa el token inyectado desde la capa de Presentación (sin lock)
  const authToken = accessToken || SUPABASE_ANON_KEY;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    // Build messages array with conversation history for context persistence
    const messagesPayload = [
      { role: 'system', content: SYSTEM_PROMPT(context) },
      ...history.slice(-10), // Last 10 turns to stay within token limits
      { role: 'user', content: prompt },
    ];

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ Edge Function falló (${response.status}):`, errorData);
      throw new Error(`Edge Function ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    console.log(`✅ Mónica AI: Respuesta exitosa (modelo: ${data.model || 'gpt-4o-mini'})`);
    return parseResponse(data.content || '');
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('❌ Mónica AI: Timeout (20s)');
      throw new Error('Timeout: Mónica tardó demasiado en responder');
    }
    console.error('❌ Mónica AI: Error:', error);
    throw error;
  }
};

// Parsear respuesta y detectar comandos
function parseResponse(content: string) {
  const taskMatch = content.match(/\[CREATE_TASK\](.*?)\[\/CREATE_TASK\]/s);
  if (taskMatch) {
    try {
      const taskData = JSON.parse(taskMatch[1]);
      const cleanText = content.replace(/\[CREATE_TASK\].*?\[\/CREATE_TASK\]/s, '').trim();
      return {
        text: cleanText || `✅ Tarea "${taskData.title}" creada.`,
        functionCalls: [{ name: 'createTask', args: taskData }],
      };
    } catch (e) {
      console.error('Error parsing task JSON:', e);
    }
  }
  return { text: content, functionCalls: null };
}
