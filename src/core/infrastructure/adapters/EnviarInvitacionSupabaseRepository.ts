/**
 * @module infrastructure/adapters/EnviarInvitacionSupabaseRepository
 * Implementación del Port IEnviarInvitacionRepository usando Supabase Edge Functions.
 *
 * REMEDIATION-007b: Extrae la lógica de fetch que estaba acoplada directamente
 * en el componente ModalInvitarUsuario.tsx, siguiendo Clean Architecture.
 *
 * Usa supabase.functions.invoke() en lugar de fetch manual para:
 *  - Manejo automático del Authorization header con el token de sesión actual.
 *  - Tipado del response body.
 *  - Consistencia con otros adapters del proyecto (ObtenerAccesoReunionUseCase, etc.).
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';
import type {
  IEnviarInvitacionRepository,
  EnviarInvitacionInput,
  EnviarInvitacionResult,
} from '../../domain/ports/IEnviarInvitacionRepository';

const log = logger.child('enviar-invitacion-repo');

interface EdgeFunctionResponse {
  error?: string;
  detail?: string;
  message?: string;
  resend_status?: number;
}

/**
 * Extrae el cuerpo JSON del FunctionsHttpError para preservar el mensaje
 * accionable que envía la edge function. En supabase-js v2.47+, cuando la
 * respuesta es non-2xx, `data` es null y `error` es FunctionsHttpError con
 * el Response original en `context`. Sin este parseo el admin vería solo
 * "Edge Function returned a non-2xx status code" (genérico e inútil).
 *
 * REMEDIATION RESEND-FAILURE-FEEDBACK (2026-04-14)
 */
async function extractEdgeErrorBody(err: unknown): Promise<EdgeFunctionResponse | null> {
  if (!(err instanceof FunctionsHttpError)) return null;
  try {
    const context = err.context as Response | undefined;
    if (!context || typeof context.json !== 'function') return null;
    return (await context.json()) as EdgeFunctionResponse;
  } catch {
    return null;
  }
}

export class EnviarInvitacionSupabaseRepository implements IEnviarInvitacionRepository {
  async enviar(input: EnviarInvitacionInput): Promise<EnviarInvitacionResult> {
    try {
      // supabase.functions.invoke() adjunta automáticamente el Bearer token de la sesión activa.
      // Equivalente al fetch manual pero sin acoplamiento a SUPABASE_URL ni SUPABASE_ANON_KEY.
      const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
        'enviar-invitacion',
        {
          method: 'POST',
          body: {
            email: input.email,
            espacio_id: input.espacioId,
            rol: input.rol,
            nombre_invitado: input.nombreInvitado,
          },
        },
      );

      if (error) {
        // Caso crítico: status 4xx/5xx (e.g. 502 Resend fail, 409 Conflict, 500 DB).
        // supabase-js v2.47+ deja data=null y guarda el Response en error.context.
        // Extraemos el JSON para preservar el mensaje accionable.
        const bodyError = await extractEdgeErrorBody(error);
        if (bodyError?.error) {
          const msg = [bodyError.error, bodyError.detail].filter(Boolean).join(' — ');
          log.warn('Invitación rechazada (HTTP no-2xx)', { msg, resend_status: bodyError.resend_status });
          return { exito: false, mensaje: msg };
        }
        log.warn('Edge Function error sin body parseable', { error: error.message });
        return { exito: false, mensaje: error.message };
      }

      // Caso legacy: status 200 con { error } en body (retrocompatibilidad).
      if (data?.error) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ');
        log.warn('Invitación rechazada por el servidor', { msg });
        return { exito: false, mensaje: msg };
      }

      return { exito: true };
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error inesperado al enviar la invitación.';
      log.error('Error en EnviarInvitacionSupabaseRepository', { error: err });
      return { exito: false, mensaje };
    }
  }
}
