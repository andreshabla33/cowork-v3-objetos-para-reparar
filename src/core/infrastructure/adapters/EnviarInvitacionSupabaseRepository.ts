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
        log.warn('Edge Function error', { error: error.message });
        return { exito: false, mensaje: error.message };
      }

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
