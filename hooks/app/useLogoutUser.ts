/**
 * Caso de Uso: LogoutUser — Capa de Aplicación
 *
 * Encapsula toda la lógica de cierre de sesión del usuario.
 * Los componentes de UI (botones) llaman ÚNICAMENTE a este hook,
 * nunca a Supabase directamente, manteniendo Clean Architecture.
 *
 * Flujo:
 *  1. Establece estado de carga local
 *  2. Llama a `signOut` del store (Infrastructure → Supabase auth.signOut())
 *  3. El store limpia sesión, workspaces y setea view → 'dashboard'
 *  4. useBootstrapAplicacion escucha el evento SIGNED_OUT y redirige al Login
 *
 * @see store/useStore.ts → signOut()
 * @see hooks/app/useBootstrapAplicacion.ts → SIGNED_OUT handler → setView('dashboard')
 * @see components/LoginScreen.tsx → renderizado cuando !session
 */

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';

interface UseLogoutUserReturn {
  /** Ejecuta el cierre de sesión completo */
  logout: () => Promise<void>;
  /** true mientras se procesa el logout (para deshabilitar el botón y mostrar spinner) */
  isLoggingOut: boolean;
}

export function useLogoutUser(): UseLogoutUserReturn {
  const signOut = useStore((state) => state.signOut);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (isLoggingOut) return; // Prevenir doble-clic
    setIsLoggingOut(true);
    try {
      await signOut();
      // El store ya setea view: 'dashboard' y limpia la sesión.
      // useBootstrapAplicacion capturará SIGNED_OUT y redirigirá al Login.
    } catch (err) {
      console.error('[LogoutUser] Error al cerrar sesión:', err);
      setIsLoggingOut(false);
    }
    // No resetear isLoggingOut en el happy path: el componente se desmontará
    // al cambiar la vista a login.
  }, [signOut, isLoggingOut]);

  return { logout, isLoggingOut };
}
