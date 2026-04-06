/**
 * @module application/usecases/GestionarCanalWebRTCUseCase
 * @description Use case for managing WebRTC signaling channel subscription and messaging.
 * Encapsulates channel lifecycle and message dispatch.
 *
 * Clean Architecture: Application layer — orchestrates domain and infrastructure.
 * Ref: Use Case pattern — single responsibility, testable.
 */

import { logger } from '@/lib/logger';
import type { ISpaceRepository, MensajeSeñalizacionWebRTC } from '../../domain/ports/ISpaceRepository';

const log = logger.child('gestionar-canal-webrtc');

/**
 * Callbacks for WebRTC signaling events.
 */
export interface CallbacksSeñalizacionWebRTC {
  onOffer: (payload: any) => void;
  onAnswer: (payload: any) => void;
  onIceCandidate: (payload: any) => void;
}

/**
 * Manage WebRTC signaling channel for a virtual space.
 * Subscribes to broadcast events and sends messages.
 */
export class GestionarCanalWebRTCUseCase {
  constructor(private spaceRepository: ISpaceRepository) {}

  /**
   * Subscribe to WebRTC signaling channel.
   * Returns unsubscribe function for cleanup.
   */
  async suscribirse(
    espacioId: string,
    callbacks: CallbacksSeñalizacionWebRTC
  ): Promise<() => void> {
    try {
      const unsubscribe = await this.spaceRepository.suscribirCanalWebRTC(
        espacioId,
        callbacks.onOffer,
        callbacks.onAnswer,
        callbacks.onIceCandidate
      );
      log.info('Subscribed to WebRTC channel', { espacioId });
      return unsubscribe;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to subscribe to WebRTC channel', {
        error: message,
        espacioId,
      });
      return () => {};
    }
  }

  /**
   * Send WebRTC signaling message.
   */
  async enviarMensaje(
    espacioId: string,
    mensaje: MensajeSeñalizacionWebRTC
  ): Promise<void> {
    try {
      await this.spaceRepository.enviarMensajeWebRTC(espacioId, mensaje);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to send WebRTC message', {
        error: message,
        espacioId,
        event: mensaje.event,
      });
    }
  }
}
