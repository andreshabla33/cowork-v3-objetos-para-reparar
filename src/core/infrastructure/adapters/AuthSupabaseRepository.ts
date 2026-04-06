/**
 * @module infrastructure/adapters/AuthSupabaseRepository
 * @description Supabase implementation of IAuthRepository.
 * Encapsulates all Supabase Auth API calls and invitation banner queries.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase JS v2 — signInWithPassword, signUp, signInAnonymously, signInWithOAuth.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IAuthRepository,
  ResultadoAuth,
  InvitacionBannerData,
} from '../../domain/ports/IAuthRepository';

const log = logger.child('auth-repo');

export class AuthSupabaseRepository implements IAuthRepository {
  async signInWithPassword(email: string, password: string): Promise<ResultadoAuth> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        log.warn('Sign in failed', { error: error.message });
        return { session: null, error: error.message };
      }
      return { session: data.session };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Sign in exception', { error: message });
      return { session: null, error: message };
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
    redirectUrl: string
  ): Promise<ResultadoAuth> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || email.split('@')[0] },
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) {
        log.warn('Sign up failed', { error: error.message });
        return { session: null, error: error.message };
      }
      if (data.session) {
        return { session: data.session };
      }
      return { session: null, needsEmailConfirmation: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Sign up exception', { error: message });
      return { session: null, error: message };
    }
  }

  async signInAnonymously(): Promise<ResultadoAuth> {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        log.warn('Anonymous sign in failed', { error: error.message });
        return { session: null, error: error.message };
      }
      return { session: data.session };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Anonymous sign in exception', { error: message });
      return { session: null, error: message };
    }
  }

  async signInWithOAuth(provider: 'google', redirectTo: string): Promise<ResultadoAuth> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) {
        log.warn('OAuth sign in failed', { error: error.message });
        return { session: null, error: error.message };
      }
      // OAuth redirects the browser — no session returned here
      return { session: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('OAuth sign in exception', { error: message });
      return { session: null, error: message };
    }
  }

  async buscarInvitacionPorTokenHash(tokenHash: string): Promise<InvitacionBannerData | null> {
    try {
      const { data, error } = await supabase
        .from('invitaciones_pendientes')
        .select(`
          email,
          rol,
          espacio:espacios_trabajo (nombre),
          invitador:usuarios!creada_por (nombre)
        `)
        .eq('token_hash', tokenHash)
        .eq('usada', false)
        .single();

      if (error || !data) {
        log.warn('Invitation banner not found', { error: error?.message });
        return null;
      }

      const espacio = data.espacio as { nombre: string } | null;
      const invitador = data.invitador as { nombre: string } | null;

      return {
        email: data.email,
        espacioNombre: espacio?.nombre || '',
        invitadorNombre: invitador?.nombre || '',
        rol: data.rol,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to query invitation banner', { error: message });
      return null;
    }
  }
}

export const authRepository = new AuthSupabaseRepository();
