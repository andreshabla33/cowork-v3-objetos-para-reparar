/**
 * @module DataDeliveryPolicy
 * Política de entrega de paquetes de datos LiveKit.
 *
 * Según docs.livekit.io/transport/:
 * - Lossy (UDP): Para datos de alta frecuencia donde perder un paquete es aceptable
 *   (posiciones de avatar ~10Hz, speaker hints). Menor latencia.
 * - Reliable (TCP-like): Para eventos que NO deben perderse
 *   (chat, invites, recording, moderation). Mayor overhead pero garantía de entrega.
 */

import type { DataPacketType } from './types';

export type DeliveryMode = 'lossy' | 'reliable';

/**
 * Mapa de tipo de paquete → modo de entrega.
 * movement y speaker_hint: alta frecuencia, toleran pérdida → lossy
 * Todo lo demás: eventos críticos que deben llegar → reliable
 */
const DELIVERY_MAP: Record<DataPacketType, DeliveryMode> = {
  movement: 'lossy',
  speaker_hint: 'lossy',
  chat: 'reliable',
  reaction: 'reliable',
  wave: 'reliable',
  nudge: 'reliable',
  invite: 'reliable',
  lock_conversation: 'reliable',
  recording_status: 'reliable',
  consent_request: 'reliable',
  consent_response: 'reliable',
  raise_hand: 'reliable',
  pin_participant: 'reliable',
  moderation_notice: 'reliable',
};

/**
 * Determina el modo de entrega para un tipo de paquete de datos.
 * Retorna true si el paquete debe enviarse de forma reliable.
 */
export function resolveDeliveryReliable(packetType: DataPacketType): boolean {
  return DELIVERY_MAP[packetType] === 'reliable';
}

/**
 * Retorna el modo de entrega para un tipo de paquete.
 */
export function resolveDeliveryMode(packetType: DataPacketType): DeliveryMode {
  return DELIVERY_MAP[packetType];
}
