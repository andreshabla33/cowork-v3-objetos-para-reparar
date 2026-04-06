/**
 * @module hooks/space3d/useVirtualSpaceData
 * @description Hook for VirtualSpace UI component.
 * Manages WebRTC signaling channel lifecycle and messaging.
 * Extracts Supabase-specific logic from VirtualSpace.tsx.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access — all data flows through repository ports.
 * Handles only data/state, not 3D rendering.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 */

import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import type { MensajeSeñalizacionWebRTC } from '@/src/core/domain/ports/ISpaceRepository';

// Adapter (singleton instance)
import { spaceRepository } from '@/src/core/infrastructure/adapters/SpaceSupabaseRepository';

// Use case
import { GestionarCanalWebRTCUseCase } from '@/src/core/application/usecases/GestionarCanalWebRTCUseCase';

const log = logger.child('use-virtual-space-data');

// Singleton use case instance
const gestionarCanal = new GestionarCanalWebRTCUseCase(spaceRepository);

/**
 * WebRTC signaling payload types.
 */
export interface WebRTCPayload {
  to: string;
  from: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Callbacks for WebRTC signaling events.
 */
export interface CallbacksWebRTC {
  onOffer: (offer: RTCSessionDescriptionInit, fromId: string) => void;
  onAnswer: (answer: RTCSessionDescriptionInit, fromId: string) => void;
  onIceCandidate: (candidate: RTCIceCandidateInit, fromId: string) => void;
}

/**
 * Return type for useVirtualSpaceData hook.
 */
export interface UseVirtualSpaceDataReturn {
  sendWebRTCMessage: (mensaje: MensajeSeñalizacionWebRTC) => Promise<void>;
}

/**
 * Hook to manage WebRTC signaling channel for virtual space.
 * Subscribes on mount, unsubscribes on unmount.
 * Provides method to send signaling messages.
 *
 * @param espacioId - Virtual space (workspace) ID
 * @param usuarioId - Current user ID
 * @param callbacks - Handlers for offer, answer, and ice-candidate events
 * @returns Hook with sendWebRTCMessage method
 *
 * @example
 * const { sendWebRTCMessage } = useVirtualSpaceData(workspaceId, userId, {
 *   onOffer: (offer, fromId) => handleOffer(offer, fromId),
 *   onAnswer: (answer, fromId) => handleAnswer(answer, fromId),
 *   onIceCandidate: (candidate, fromId) => handleIceCandidate(candidate, fromId),
 * });
 */
export function useVirtualSpaceData(
  espacioId: string | undefined,
  usuarioId: string | undefined,
  callbacks: CallbacksWebRTC
): UseVirtualSpaceDataReturn {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Subscribe to WebRTC channel on mount
  useEffect(() => {
    if (!espacioId || !usuarioId) {
      log.debug('Skipping WebRTC subscription', { hasEspacioId: !!espacioId, hasUsuarioId: !!usuarioId });
      return;
    }

    const setupChannel = async () => {
      try {
        unsubscribeRef.current = await gestionarCanal.suscribirse(
          espacioId,
          {
            onOffer: (payload: WebRTCPayload) => {
              // Only handle if message is for current user
              if (payload.to === usuarioId && payload.offer) {
                callbacks.onOffer(payload.offer, payload.from);
              }
            },
            onAnswer: (payload: WebRTCPayload) => {
              if (payload.to === usuarioId && payload.answer) {
                callbacks.onAnswer(payload.answer, payload.from);
              }
            },
            onIceCandidate: (payload: WebRTCPayload) => {
              if (payload.to === usuarioId && payload.candidate) {
                callbacks.onIceCandidate(payload.candidate, payload.from);
              }
            },
          }
        );
        log.info('WebRTC channel setup complete', { espacioId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to setup WebRTC channel', { error: message, espacioId });
      }
    };

    setupChannel();

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        log.debug('WebRTC channel cleanup', { espacioId });
      }
    };
  }, [espacioId, usuarioId, callbacks]);

  // Method to send WebRTC signaling message
  const sendWebRTCMessage = useCallback(
    async (mensaje: MensajeSeñalizacionWebRTC) => {
      if (!espacioId) {
        log.warn('Cannot send WebRTC message: no espacioId', { event: mensaje.event });
        return;
      }

      try {
        await gestionarCanal.enviarMensaje(espacioId, mensaje);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Error sending WebRTC message', {
          error: message,
          event: mensaje.event,
          espacioId,
        });
      }
    },
    [espacioId]
  );

  return { sendWebRTCMessage };
}
