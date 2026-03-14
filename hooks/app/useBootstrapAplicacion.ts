import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

interface ParametrosBootstrapAplicacion {
  initialize: () => Promise<unknown>;
  setSession: (session: Session | null) => void;
  setView: (view: 'dashboard' | 'workspace' | 'invitation' | 'loading' | 'onboarding' | 'onboarding_creador') => void;
  setAuthFeedback: (feedback: { type: 'success' | 'error'; message: string } | null) => void;
}

export function useBootstrapAplicacion({ initialize, setSession, setView, setAuthFeedback }: ParametrosBootstrapAplicacion) {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenHash = urlParams.get('token_hash');
    const type = urlParams.get('type');

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
            setSession(data.session);
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
      setSession(session);

      if (event === 'SIGNED_IN') {
        const state = useStore.getState();
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
