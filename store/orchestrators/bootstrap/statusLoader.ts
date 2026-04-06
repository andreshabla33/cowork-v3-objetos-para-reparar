/**
 * @module store/orchestrators/bootstrap/statusLoader
 * @description Loads user presence status and profile photo.
 * Atomic orchestrator — single data responsibility.
 */

import { PresenceStatus } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

const log = logger.child('status-loader');

export interface StatusLoadResult {
  estado_disponibilidad: PresenceStatus;
  estado_personalizado: string;
  profilePhoto: string;
}

/**
 * Load user status (availability, custom status text, profile photo).
 */
export async function cargarStatus(userId: string): Promise<StatusLoadResult> {
  const defaults: StatusLoadResult = {
    estado_disponibilidad: PresenceStatus.AVAILABLE,
    estado_personalizado: '',
    profilePhoto: '',
  };

  try {
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('estado_disponibilidad, estado_personalizado, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (usuarioData) {
      return {
        estado_disponibilidad: (usuarioData.estado_disponibilidad as PresenceStatus) || PresenceStatus.AVAILABLE,
        estado_personalizado: usuarioData.estado_personalizado || '',
        profilePhoto: usuarioData.avatar_url || '',
      };
    }
  } catch (error: unknown) {
    log.warn('Could not load user status', { error: error instanceof Error ? error.message : String(error) });
  }

  return defaults;
}
