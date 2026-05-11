/**
 * @module hooks/space3d/useEstadoGrabacion
 * Hook para gestión de estado de grabación.
 * Maneja: recording trigger, isRecording, duration, consent, tipo.
 *
 * Renombrado desde useRecording → useEstadoGrabacion para consistencia
 * con la nomenclatura en español del proyecto.
 */

import { useState, useCallback, useEffect } from 'react';
import { recordingRepository } from '@/core/infrastructure/adapters/RecordingSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';
import type { UseRecordingReturn } from './types';

const log = logger.child('useEstadoGrabacion');

/** @deprecated Usar useEstadoGrabacion */
export const useRecording = useEstadoGrabacion;

export function useEstadoGrabacion(
  sessionUserId: string | undefined
): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [consentimientoAceptado, setConsentimientoAceptado] = useState(false);
  const [tipoGrabacionActual, setTipoGrabacionActual] = useState<string | null>(null);
  const [recordingTrigger, setRecordingTrigger] = useState(false);

  // Toggle grabación — dispara el trigger que RecordingManager consume
  const handleToggleRecording = useCallback(() => {
    setRecordingTrigger(true);
  }, []);

  // Escuchar notificaciones de consentimiento aceptado (para el grabador)
  useEffect(() => {
    if (!sessionUserId) return;
    return recordingRepository.suscribirNotificacionesUsuario(sessionUserId, (notif) => {
      if (notif.tipo === 'consentimiento_respuesta' && (notif.titulo as string | null)?.includes('Aceptado')) {
        log.info('✅ Consentimiento aceptado por el evaluado');
        setConsentimientoAceptado(true);
      }
    });
  }, [sessionUserId]);

  return {
    isRecording,
    setIsRecording,
    recordingDuration,
    setRecordingDuration,
    consentimientoAceptado,
    setConsentimientoAceptado,
    tipoGrabacionActual,
    setTipoGrabacionActual,
    recordingTrigger,
    setRecordingTrigger,
    handleToggleRecording,
  };
}
