/**
 * @module store/orchestrators/bootstrap/statusLoader
 * @description Loads user presence status and profile photo.
 * Atomic orchestrator — single data responsibility.
 *
 * Performance (500+ avatars): The `usuarios` query is now pre-fetched by
 * userDataLoader and injected via `UserStatusData`, eliminating 1 RTT per boot.
 * Falls back to a direct query if pre-fetched data is not provided.
 */

import { PresenceStatus } from '../../../types';
import type { UserStatusData } from './userDataLoader';
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
 *
 * @param userId    Authenticated user ID
 * @param userData  Pre-fetched status fields from userDataLoader (eliminates duplicate query)
 */
export async function cargarStatus(
  userId: string,
  userData?: UserStatusData,
): Promise<StatusLoadResult> {
  const defaults: StatusLoadResult = {
    estado_disponibilidad: PresenceStatus.AVAILABLE,
    estado_personalizado: '',
    profilePhoto: '',
  };

  // Use pre-fetched data if available (zero extra queries)
  if (userData) {
    return {
      estado_disponibilidad: (userData.estado_disponibilidad as PresenceStatus) || PresenceStatus.AVAILABLE,
      estado_personalizado: userData.estado_personalizado || '',
      profilePhoto: userData.avatar_url || '',
    };
  }

  // Fallback: direct query (backward compatibility)
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
