/**
 * @module store/orchestrators/bootstrap/authBootstrap
 * @description Handles session retrieval and user upsert.
 * Atomic orchestrator — single responsibility.
 *
 * Ref: Supabase JS v2 — supabase.auth.getSession() returns { data: { session } }
 */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

const log = logger.child('auth-bootstrap');

export interface AuthBootstrapResult {
  session: Session | null;
  error: string | null;
}

/**
 * Retrieve the current Supabase session and upsert the user record.
 */
export async function ejecutarAuthBootstrap(): Promise<AuthBootstrapResult> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      log.error('Session error', { error: sessionError.message });
      return { session: null, error: sessionError.message };
    }

    if (!session) {
      log.debug('No active session');
      return { session: null, error: null };
    }

    log.info('Session found', { email: session.user.email });

    // Upsert user record (safety net for new users)
    try {
      await supabase
        .from('usuarios')
        .upsert(
          {
            id: session.user.id,
            email: session.user.email,
            nombre: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Usuario',
            estado_disponibilidad: 'available',
          },
          { onConflict: 'id', ignoreDuplicates: false },
        );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn('Upsert usuarios safety net failed', { error: msg });
    }

    return { session, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('Auth bootstrap failed', { error: msg });
    return { session: null, error: msg };
  }
}
