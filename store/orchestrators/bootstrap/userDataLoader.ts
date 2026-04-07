/**
 * @module store/orchestrators/bootstrap/userDataLoader
 * @description Unified loader for user-level data from the `usuarios` table.
 *
 * Previously, avatarLoader and statusLoader each made a separate query to the
 * same `usuarios` row — 2 RTTs for one row. This module fetches ALL user
 * fields needed by both loaders in a single query and distributes the result.
 *
 * Estimated saving: ~150-300 ms (one RTT elimination on cold start).
 *
 * Clean Architecture: Infrastructure layer — direct Supabase access.
 * Consumers (avatarLoader, statusLoader) receive typed partial data.
 *
 * Designed for 500+ concurrent avatars:
 *   - Single query per user at boot → O(1) per connection
 *   - No N+1 risk — each client only fetches its own row
 *
 * Ref: Supabase JS v2 — .maybeSingle() for optional rows.
 */

import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

const log = logger.child('user-data-loader');

// ─── Result types for consumers ──────────────────────────────────────────────

/** Fields needed by avatarLoader */
export interface UserAvatarData {
  avatar_3d_id: string | null;
}

/** Fields needed by statusLoader */
export interface UserStatusData {
  estado_disponibilidad: string | null;
  estado_personalizado: string | null;
  avatar_url: string | null;
}

/** Combined result from a single query */
export interface UserBootstrapData {
  avatar: UserAvatarData;
  status: UserStatusData;
}

// ─── Default (when query fails or user row doesn't exist) ────────────────────

const DEFAULTS: UserBootstrapData = {
  avatar: { avatar_3d_id: null },
  status: {
    estado_disponibilidad: null,
    estado_personalizado: null,
    avatar_url: null,
  },
};

// ─── Loader ──────────────────────────────────────────────────────────────────

/**
 * Fetches all boot-critical user fields in a single Supabase query.
 *
 * Replaces:
 *   - avatarLoader: `supabase.from('usuarios').select('avatar_3d_id')...`
 *   - statusLoader: `supabase.from('usuarios').select('estado_disponibilidad, estado_personalizado, avatar_url')...`
 *
 * @param userId  Authenticated user ID (from session, NOT from getUser())
 * @returns       Typed partial data for avatar and status loaders
 */
export async function cargarDatosUsuario(userId: string): Promise<UserBootstrapData> {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('avatar_3d_id, estado_disponibilidad, estado_personalizado, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      log.warn('Query failed, using defaults', { code: error.code, message: error.message });
      return DEFAULTS;
    }

    if (!data) {
      log.debug('No user row found, using defaults', { userId });
      return DEFAULTS;
    }

    return {
      avatar: {
        avatar_3d_id: data.avatar_3d_id ?? null,
      },
      status: {
        estado_disponibilidad: data.estado_disponibilidad ?? null,
        estado_personalizado: data.estado_personalizado ?? null,
        avatar_url: data.avatar_url ?? null,
      },
    };
  } catch (err: unknown) {
    log.warn('Unexpected error loading user data', {
      error: err instanceof Error ? err.message : String(err),
    });
    return DEFAULTS;
  }
}
