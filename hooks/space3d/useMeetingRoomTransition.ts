/**
 * @module hooks/space3d/useMeetingRoomTransition
 *
 * Hook presentacional que orquesta la transición de Rooms LiveKit cuando
 * el avatar entra/sale de una zona meeting. Consume el Use Case de la
 * Application layer y el adapter de Infrastructure.
 *
 * Flujo:
 *   1. Recibe `currentMeetingZoneId` del caller (derivado de `effectiveZone`).
 *   2. Detecta transiciones:
 *        null → <id>       = entrar a meeting  → MoveToMeetingRoomUseCase
 *        <id> → null       = salir de meeting  → ReturnToGlobalRoomUseCase
 *        <id1> → <id2>     = switch meeting    → Return + Move (sequential)
 *   3. Debounce 2s para evitar flap al cruzar bordes de zonas.
 *   4. Expone `{ isMoving, lastError }` para feedback UI.
 *
 * Clean Architecture: este hook vive en Presentation y solo importa desde
 * Application (UseCase) e Infrastructure (Adapter). Nunca llama LiveKit
 * ni Supabase functions directamente.
 *
 * Refs:
 *  - Application: src/core/application/usecases/MoveToMeetingRoomUseCase.ts
 *  - Infrastructure: src/core/infrastructure/adapters/LiveKitMoveParticipantSupabaseAdapter.ts
 *  - LiveKit moveParticipant: https://docs.livekit.io/home/server/managing-rooms/
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  MoveToMeetingRoomUseCase,
  ReturnToGlobalRoomUseCase,
  type MoveToMeetingRoomResult,
} from '@/src/core/application/usecases/MoveToMeetingRoomUseCase';
import { LiveKitMoveParticipantSupabaseAdapter } from '@/src/core/infrastructure/adapters/LiveKitMoveParticipantSupabaseAdapter';
import { logger } from '@/lib/logger';

const log = logger.child('useMeetingRoomTransition');

/** Debounce para evitar flap al cruzar bordes de meeting zones. */
const TRANSITION_DEBOUNCE_MS = 2000;

export interface UseMeetingRoomTransitionParams {
  /** ID del espacio actual (required). Sin esto no se dispara nada. */
  espacioId: string | null | undefined;
  /** Identity del usuario en LiveKit — típicamente `session.user.id`. */
  identity: string | null | undefined;
  /** ID de la meeting zone actual, o null si el avatar NO está en una meeting. */
  currentMeetingZoneId: string | null;
  /** Gate de feature — permite desactivar el multi-room flow sin deploy. */
  enabled?: boolean;
}

export interface UseMeetingRoomTransitionReturn {
  /** True mientras se está ejecutando un move → useful para banner UI. */
  isMoving: boolean;
  /** Último error (null si todo OK). */
  lastError: string | null;
  /** Room actual donde está el participante (global o meeting). Útil para logs. */
  currentZoneId: string | null;
}

export function useMeetingRoomTransition(
  params: UseMeetingRoomTransitionParams,
): UseMeetingRoomTransitionReturn {
  const { espacioId, identity, currentMeetingZoneId, enabled = true } = params;

  // Ref al último zoneId aplicado (ya confirmado tras un move exitoso).
  const appliedZoneIdRef = useRef<string | null>(null);
  // Ref al timer de debounce.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref al espacioId estable (inicial).
  const espacioIdRef = useRef<string | null>(null);

  const [isMoving, setIsMoving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentZoneId, setCurrentZoneId] = useState<string | null>(null);

  // Use cases + adapter construidos una sola vez (singletons por hook instance).
  const useCasesRef = useRef<{
    moveToMeeting: MoveToMeetingRoomUseCase;
    returnToGlobal: ReturnToGlobalRoomUseCase;
  } | null>(null);
  if (useCasesRef.current === null) {
    const adapter = new LiveKitMoveParticipantSupabaseAdapter(supabase);
    useCasesRef.current = {
      moveToMeeting: new MoveToMeetingRoomUseCase(adapter),
      returnToGlobal: new ReturnToGlobalRoomUseCase(adapter),
    };
  }

  // Sync espacioId inicial (no cambia en una sesión típica).
  if (espacioId && espacioIdRef.current === null) {
    espacioIdRef.current = espacioId;
  }

  useEffect(() => {
    if (!enabled) return;
    if (!identity || !espacioId) return;

    // Si el zoneId objetivo es igual al aplicado, no hacer nada.
    if (currentMeetingZoneId === appliedZoneIdRef.current) return;

    // Cancelar debounce previo si hay uno pendiente.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Capturar el target zone para la comparación tras el debounce.
    const targetZoneId = currentMeetingZoneId;

    debounceTimerRef.current = setTimeout(async () => {
      // Re-verificar que sigue pendiente (el user puede haber cruzado
      // de nuevo durante el debounce).
      if (appliedZoneIdRef.current === targetZoneId) return;

      const useCases = useCasesRef.current;
      if (!useCases) return;

      setIsMoving(true);
      setLastError(null);

      try {
        // Caso 1: SALIR de meeting actual (si había una) antes de entrar a otra.
        if (appliedZoneIdRef.current !== null) {
          const fromZone = appliedZoneIdRef.current;
          log.info('Leaving meeting room', { fromZoneId: fromZone, identity });
          const leaveResult: MoveToMeetingRoomResult = await useCases.returnToGlobal.execute({
            identity,
            espacioId,
            fromZoneId: fromZone,
          });
          if (!leaveResult.ok) {
            const errorMsg = formatError(leaveResult.error);
            log.warn('Return to global failed', { error: errorMsg, fromZone });
            setLastError(errorMsg);
            setIsMoving(false);
            return;
          }
          appliedZoneIdRef.current = null;
          setCurrentZoneId(null);
        }

        // Caso 2: ENTRAR a nueva meeting (si hay target).
        if (targetZoneId !== null) {
          log.info('Entering meeting room', { toZoneId: targetZoneId, identity });
          const enterResult: MoveToMeetingRoomResult = await useCases.moveToMeeting.execute({
            identity,
            espacioId,
            zoneId: targetZoneId,
          });
          if (!enterResult.ok) {
            const errorMsg = formatError(enterResult.error);
            log.warn('Move to meeting failed', { error: errorMsg, toZone: targetZoneId });
            setLastError(errorMsg);
            setIsMoving(false);
            return;
          }
          appliedZoneIdRef.current = targetZoneId;
          setCurrentZoneId(targetZoneId);
        }

        log.info('Meeting room transition complete', {
          targetZoneId,
          identity,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error('Meeting room transition exception', { error: errorMsg });
        setLastError(errorMsg);
      } finally {
        setIsMoving(false);
      }
    }, TRANSITION_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [currentMeetingZoneId, identity, espacioId, enabled]);

  return { isMoving, lastError, currentZoneId };
}

function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code;
    const detail = (err as { detail?: string }).detail;
    return detail ? `${code}: ${detail}` : code;
  }
  return String(err);
}
