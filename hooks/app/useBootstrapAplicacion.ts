/**
 * @module hooks/app/useBootstrapAplicacion
 * @description Application bootstrap hook — session verification, OTP confirmation,
 * and auth state change handling.
 *
 * Dependencies:
 * - Receives store actions via props (DI pattern, ARC-010)
 * - Uses useStore.getState() inside onAuthStateChange callback for fresh state
 *   (accepted Zustand pattern: getState() for non-reactive access in closures)
 *
 * Ref: Supabase JS v2 — onAuthStateChange events, verifyOtp API.
 * Ref: Zustand 5 — getState() for imperative access outside React render cycle.
 */

import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';

const log = logger.child('bootstrap');

interface ParametrosBootstrapAplicacion {
  initialize: () => Promise<unknown>;
  setSession: (session: Session | null) => void;
  setView: (view: 'dashboard' | 'workspace' | 'invitation' | 'loading' | 'onboarding' | 'onboarding_creador' | 'reset_password') => void;
  setAuthFeedback: (feedback: { type: 'success' | 'error'; message: string } | null) => void;
}

export function useBootstrapAplicacion({ initialize, setSession, setView, setAuthFeedback }: ParametrosBootstrapAplicacion) {
  // Ref para deduplicar eventos de auth que llegan muy seguidos
  const lastAuthEventRef = useRef<{ event: string; userId: string; timestamp: number } | null>(null);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenHash = urlParams.get('token_hash');
    const type = urlParams.get('type');

    const shouldSyncSession = (nextSession: Session | null) => {
      const currentSession = useStore.getState().session;
      return currentSession?.access_token !== nextSession?.access_token || currentSession?.user?.id !== nextSession?.user?.id;
    };

    const verificarEInicializar = async () => {
      if (tokenHash && (type === 'signup' || type === 'email')) {
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type === 'signup' ? 'signup' : 'email',
          });
          if (error) {
            setAuthFeedback({ type: 'error', message: 'Error al confirmar email. Intenta registrarte de nuevo.' });
          } else if (data.session) {
            if (shouldSyncSession(data.session)) {
              setSession(data.session);
            }
            setAuthFeedback({ type: 'success', message: '¡Email confirmado! Bienvenido a Cowork.' });
          }
          window.history.replaceState({}, '', window.location.pathname);
        } catch (err: unknown) {
          log.error('Error en verifyOtp', { error: err instanceof Error ? err.message : String(err) });
        }
      }
      await initialize();
    };

    void verificarEInicializar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Deduplicación: ignorar eventos idénticos que lleguen dentro de 500ms
      const eventKey = `${event}:${session?.user?.id || 'no-user'}`;
      const now = Date.now();
      const lastEvent = lastAuthEventRef.current;
      
      if (lastEvent && lastEvent.event === eventKey && (now - lastEvent.timestamp) < 500) {
        log.debug(`Auth event deduplicado`, { event, within: '500ms' });
        return;
      }
      
      lastAuthEventRef.current = { event: eventKey, userId: session?.user?.id || 'no-user', timestamp: now };
      log.info('Auth event', { event, userId: session?.user?.id });

      // ─── PASSWORD_RECOVERY: NO inicializar, NO redirigir al dashboard ────────
      // Este evento llega cuando el usuario hace clic en el link del correo de
      // recuperación. Guardamos la sesión temporal y seteamos la vista especial.
      // NO llamamos initialize() porque eso buscaría workspaces y redirigiría.
      if (event === 'PASSWORD_RECOVERY') {
        log.info('PASSWORD_RECOVERY: activando pantalla de reset');
        if (shouldSyncSession(session)) {
          setSession(session);
        }
        setView('reset_password');
        return; // ← Salir SIN llamar initialize()
      }

      if (shouldSyncSession(session)) {
        setSession(session);
      }

      if (event === 'SIGNED_IN') {
        const state = useStore.getState();
        // Si ya estamos en el flujo de reset, ignorar el SIGNED_IN que Supabase
        // dispara junto con PASSWORD_RECOVERY para no sobreescribir la vista
        if (state.view === 'reset_password') {
          log.debug('SIGNED_IN ignorado: flujo reset_password activo');
          return;
        }
        // Si ya estamos en onboarding, no re-inicializar (usuario nuevo sin workspaces)
        if (state.initialized && (state.view === 'onboarding_creador' || state.view === 'onboarding')) {
          log.debug('SIGNED_IN ignorado: flujo onboarding activo');
          return;
        }
        if (state.initialized && state.activeWorkspace) {
          log.debug('SIGNED_IN: ya inicializado con workspace activo, omitiendo re-init');
          return;
        }
        await initialize();
      } else if (event === 'SIGNED_OUT') {
        setView('dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [initialize, setAuthFeedback, setSession, setView]);
}

