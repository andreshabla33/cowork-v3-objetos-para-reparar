import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '@/store/useStore';
import type { CargoLaboral } from '../components/onboarding/CargoSelector';

interface OnboardingState {
  isLoading: boolean;
  error: string | null;
  espacioId: string | null;
  espacioNombre: string | null;
  cargoSugerido: CargoLaboral | null;
  onboardingCompletado: boolean;
  miembroId: string | null;
}

interface UseOnboardingReturn extends OnboardingState {
  completarOnboarding: (cargo: CargoLaboral) => Promise<boolean>;
  verificarOnboarding: () => Promise<void>;
}

/**
 * Hook de capa Aplicación para gestionar el flujo de onboarding.
 * Lee userId/email del store Zustand (alimentado por onAuthStateChange)
 * en vez de llamar getUser() directamente → evita auth lock orphan.
 */
export function useOnboarding(): UseOnboardingReturn {
  const session = useStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;

  const [state, setState] = useState<OnboardingState>({
    isLoading: true,
    error: null,
    espacioId: null,
    espacioNombre: null,
    cargoSugerido: null,
    onboardingCompletado: false,
    miembroId: null,
  });

  // Verificar estado de onboarding del usuario
  const verificarOnboarding = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Leer userId del store (síncrono, sin lock)
      const currentUserId = useStore.getState().session?.user?.id ?? null;
      const currentEmail = useStore.getState().session?.user?.email ?? null;

      if (!currentUserId) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No hay sesión activa',
        }));
        return;
      }

      // Buscar membresía del usuario con espacio
      const { data: miembro, error: miembroError } = await supabase
        .from('miembros_espacio')
        .select(`
          id,
          espacio_id,
          cargo,
          cargo_id,
          onboarding_completado,
          espacios_trabajo:espacio_id (
            id,
            nombre
          )
        `)
        .eq('usuario_id', currentUserId)
        .eq('aceptado', true)
        .single();

      if (miembroError && miembroError.code !== 'PGRST116') {
        console.error('Error buscando membresía:', miembroError);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Error al verificar membresía',
        }));
        return;
      }

      if (!miembro) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          onboardingCompletado: false,
        }));
        return;
      }

      // Verificar si hay cargo sugerido en invitación pendiente
      const { data: invitacion } = await supabase
        .from('invitaciones_pendientes')
        .select('cargo_sugerido')
        .eq('email', currentEmail)
        .eq('usada', true)
        .single();

      const espacioData = miembro.espacios_trabajo as Record<string, unknown> | null;

      setState({
        isLoading: false,
        error: null,
        espacioId: miembro.espacio_id,
        espacioNombre: (espacioData?.nombre as string) || 'tu espacio',
        cargoSugerido: invitacion?.cargo_sugerido as CargoLaboral || null,
        onboardingCompletado: miembro.onboarding_completado || false,
        miembroId: miembro.id,
      });

    } catch (err) {
      console.error('Error en verificarOnboarding:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Error inesperado al verificar onboarding',
      }));
    }
  }, []);

  // Completar onboarding guardando el cargo
  const completarOnboarding = useCallback(async (cargo: CargoLaboral): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      if (!state.miembroId) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No se encontró la membresía',
        }));
        return false;
      }

      // Actualizar cargo y marcar onboarding como completado
      const { error: updateError } = await supabase
        .from('miembros_espacio')
        .update({
          cargo_id: cargo,
          onboarding_completado: true,
        })
        .eq('id', state.miembroId);

      if (updateError) {
        console.error('Error actualizando cargo:', updateError);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Error al guardar el cargo',
        }));
        return false;
      }

      // Marcar invitaciones como usadas (lee email del store, sin lock)
      const currentEmail = useStore.getState().session?.user?.email;
      if (currentEmail && state.espacioId) {
        await supabase
          .from('invitaciones_pendientes')
          .update({ usada: true })
          .eq('email', currentEmail.toLowerCase())
          .eq('espacio_id', state.espacioId)
          .eq('usada', false);
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        onboardingCompletado: true,
      }));

      return true;

    } catch (err) {
      console.error('Error en completarOnboarding:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Error inesperado al completar onboarding',
      }));
      return false;
    }
  }, [state.miembroId, state.espacioId]);

  // Re-verificar cuando cambia el usuario autenticado
  useEffect(() => {
    verificarOnboarding();
  }, [verificarOnboarding, userId]);

  return {
    ...state,
    completarOnboarding,
    verificarOnboarding,
  };
}

export default useOnboarding;
