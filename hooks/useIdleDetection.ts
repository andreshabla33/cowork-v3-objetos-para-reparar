import { useEffect, useRef, useCallback } from 'react';
import { PresenceStatus } from '../types';
import { useStore } from '../store/useStore';

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas sin actividad (jornada laboral) → away
const EVENTS_TO_WATCH = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'];

/**
 * Hook de detección de inactividad.
 * Después de IDLE_TIMEOUT_MS sin actividad del usuario (mouse, teclado, touch),
 * cambia automáticamente el estado a AWAY.
 * Al detectar actividad de nuevo, restaura el estado anterior.
 * 
 * No sobreescribe estados manuales: si el usuario se puso DND o BUSY manualmente,
 * no se toca. Solo actúa cuando el estado es AVAILABLE.
 */
export function useIdleDetection() {
  const updateStatus = useStore((s) => s.updateStatus);
  const currentStatus = useStore((s) => s.currentUser.status);
  const session = useStore((s) => s.session);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);
  const previousStatusRef = useRef<PresenceStatus>(PresenceStatus.AVAILABLE);
  const manualStatusRef = useRef(false);

  // Restaurar actividad
  const handleActivity = useCallback(() => {
    // Reiniciar timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Si estaba idle por inactividad, restaurar estado anterior
    if (isIdleRef.current && !manualStatusRef.current) {
      isIdleRef.current = false;
      console.log(`👁️ Actividad detectada — restaurando estado: ${previousStatusRef.current}`);
      updateStatus(previousStatusRef.current);
    }

    // Programar idle
    timerRef.current = setTimeout(() => {
      // Solo marcar away si el estado actual es AVAILABLE (no tocar DND/BUSY manuales)
      const status = useStore.getState().currentUser.status;
      if (status === PresenceStatus.AVAILABLE) {
        previousStatusRef.current = status;
        isIdleRef.current = true;
        manualStatusRef.current = false;
        console.log(`💤 Inactividad detectada (${IDLE_TIMEOUT_MS / 60000} min) — estado → away`);
        updateStatus(PresenceStatus.AWAY);
      }
    }, IDLE_TIMEOUT_MS);
  }, [updateStatus]);

  // Detectar cambios manuales de estado (para no sobreescribirlos)
  useEffect(() => {
    if (!isIdleRef.current) {
      // El usuario cambió su estado manualmente mientras estaba activo
      previousStatusRef.current = currentStatus;
      if (currentStatus === PresenceStatus.BUSY || currentStatus === PresenceStatus.DND) {
        manualStatusRef.current = true;
      } else {
        manualStatusRef.current = false;
      }
    }
  }, [currentStatus]);

  // Registrar/limpiar event listeners
  useEffect(() => {
    if (!session?.user?.id) return;

    // Iniciar timer al montar
    handleActivity();

    EVENTS_TO_WATCH.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENTS_TO_WATCH.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [session?.user?.id, handleActivity, updateStatus]);
}
