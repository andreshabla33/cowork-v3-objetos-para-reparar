/**
 * useAuthSession — Hook de capa Aplicación para acceder a datos de sesión auth.
 *
 * Expone userId, accessToken y email de forma reactiva desde el store Zustand,
 * que a su vez se alimenta de onAuthStateChange en useBootstrapAplicacion.
 *
 * IMPORTANTE: Reemplaza las llamadas directas a supabase.auth.getSession()
 * en componentes de Presentación, eliminando:
 *  1. Violación de Clean Architecture (Presentación → Infraestructura)
 *  2. Auth lock orphan (getSession adquiere Web Lock que puede quedar colgado)
 *  3. Llamadas async innecesarias (el store ya es síncrono y reactivo)
 *
 * @see https://supabase.com/docs/reference/javascript/auth-onauthstatechange
 * @see hooks/app/useBootstrapAplicacion.ts — suscripción a onAuthStateChange
 */

import { useStore } from '@/store/useStore';
import { useCallback } from 'react';

export interface AuthSessionData {
  /** ID del usuario autenticado, o null si no hay sesión */
  userId: string | null;
  /** Token JWT de acceso, o null si no hay sesión */
  accessToken: string | null;
  /** Email del usuario autenticado, o null */
  email: string | null;
  /** Indica si hay una sesión activa */
  isAuthenticated: boolean;
}

/**
 * Hook reactivo que expone datos de sesión sin llamar a getSession().
 * Lee directamente del store Zustand, que se actualiza vía onAuthStateChange.
 */
export function useAuthSession(): AuthSessionData {
  const session = useStore((s) => s.session);

  return {
    userId: session?.user?.id ?? null,
    accessToken: session?.access_token ?? null,
    email: session?.user?.email ?? null,
    isAuthenticated: !!session?.user?.id,
  };
}

/**
 * Hook imperativo para obtener datos de sesión en callbacks/handlers
 * sin suscribirse a re-renders. Usa getState() de Zustand.
 *
 * Útil en event handlers (handleGuardar, handleEliminar) donde no
 * necesitas reactividad sino un snapshot puntual.
 */
export function useAuthSessionGetter(): () => AuthSessionData {
  return useCallback(() => {
    const { session } = useStore.getState();
    return {
      userId: session?.user?.id ?? null,
      accessToken: session?.access_token ?? null,
      email: session?.user?.email ?? null,
      isAuthenticated: !!session?.user?.id,
    };
  }, []);
}
