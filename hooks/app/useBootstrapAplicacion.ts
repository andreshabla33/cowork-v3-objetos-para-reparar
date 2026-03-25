import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

interface ParametrosBootstrapAplicacion {
  initialize: () => Promise<unknown>;
  setSession: (session: Session | null) => void;
  setView: (view: 'dashboard' | 'workspace' | 'invitation' | 'loading' | 'onboarding' | 'onboarding_creador' | 'reset_password') => void;
  setAuthFeedback: (feedback: { type: 'success' | 'error'; message: string } | null) => void;
}

export function useBootstrapAplicacion({ initialize, setSession, setView, setAuthFeedback }: ParametrosBootstrapAplicacion) {
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
        } catch (err) {
          console.error('Error en verifyOtp:', err);
        }
      }
      await initialize();
    };

    void verificarEInicializar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth Event:', event);

      // ─── PASSWORD_RECOVERY: NO inicializar, NO redirigir al dashboard ────────
      // Este evento llega cuando el usuario hace clic en el link del correo de
      // recuperación. Guardamos la sesión temporal y seteamos la vista especial.
      // NO llamamos initialize() porque eso buscaría workspaces y redirigiría.
      if (event === 'PASSWORD_RECOVERY') {
        console.log('Auth Event PASSWORD_RECOVERY: Activando pantalla de reset');
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
          console.log('Auth Event SIGNED_IN ignorado: estamos en flujo reset_password');
          return;
        }
        // Si ya estamos en onboarding, no re-inicializar (usuario nuevo sin workspaces)
        if (state.initialized && (state.view === 'onboarding_creador' || state.view === 'onboarding')) {
          console.log('Auth Event SIGNED_IN ignorado: estamos en flujo onboarding');
          return;
        }
        if (state.initialized && state.activeWorkspace) {
          console.log('Auth Event SIGNED_IN: Already initialized with workspace, skipping re-init');
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

