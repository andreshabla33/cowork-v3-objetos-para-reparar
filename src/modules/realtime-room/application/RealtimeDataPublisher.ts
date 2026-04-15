/**
 * RealtimeDataPublisher — Servicio de aplicación compartido para publicación de datos LiveKit.
 *
 * Encapsula toda la lógica de serialización, resolución de política de entrega
 * (lossy/reliable) y envío de paquetes de datos a través de Room.localParticipant.
 *
 * Optimizaciones activas (Roadmap REMEDIATION-005):
 *  - seq: número de secuencia monotónico automático para paquetes Reliable.
 *    El receptor ignora paquetes con seq ya procesados (idempotencia).
 *  - Solo paquetes Reliable llevan seq; lossy (movement, speaker_hint) no lo usan.
 *
 * Usado por composición en SpaceRealtimeCoordinator (3D) y LiveKitRoomGateway (meetings),
 * eliminando la duplicación de ~30% de código entre ambos pipelines.
 *
 * @see docs.livekit.io/transport/ — DataDeliveryPolicy
 */

import type { Room } from 'livekit-client';
import { logger } from '@/lib/logger';
import {
  type DataPacketContract,
  type PublishableDataPacketContract,
  type ReactionPayload,
  type RecordingStatusPayload,
  type ConsentRequestPayload,
  type ConsentResponsePayload,
  type RaiseHandPayload,
  type PinParticipantPayload,
  type SpeakerHintPayload,
  type ModerationNoticePayload,
  createReactionDataPacket,
  createRecordingStatusDataPacket,
  createConsentRequestDataPacket,
  createConsentResponseDataPacket,
  createRaiseHandDataPacket,
  createPinParticipantDataPacket,
  createSpeakerHintDataPacket,
  createModerationNoticeDataPacket,
} from '../domain/types';
import { resolveDeliveryReliable } from '../domain/DataDeliveryPolicy';

/** Función que provee la Room activa (lazy, evita acoplamiento directo). */
export type RoomProvider = () => Room | null;

const log = logger.child('realtime-data-publisher');

/**
 * Servicio que publica DataPacketContract sobre una Room LiveKit.
 * La Room se obtiene vía RoomProvider para soportar reconexiones transparentes.
 *
 * Mantiene un contador de secuencia monotónico (_seq) para paquetes Reliable,
 * garantizando idempotencia en el receptor ante duplicados por reconexión.
 */
export class RealtimeDataPublisher {
  /** Contador de secuencia monotónico para paquetes Reliable */
  private _seq = 0;

  constructor(private readonly roomProvider: RoomProvider) {}

  // ─── Core publish ───────────────────────────────────────────────

  /**
   * Publica un paquete de datos en la sala LiveKit.
   * Resuelve automáticamente lossy/reliable vía DataDeliveryPolicy.
   * Para paquetes Reliable, inyecta automáticamente el campo `seq`.
   *
   * @param data             — Paquete tipado (DataPacketContract)
   * @param reliableOverride — Si se proporciona, sobreescribe la política automática.
   */
  async publish(data: PublishableDataPacketContract, reliableOverride?: boolean): Promise<boolean> {
    const room = this.roomProvider();
    if (!room || room.state !== 'connected') {
      log.warn('Cannot publish data — room not connected', { type: data.type });
      return false;
    }

    const reliable = reliableOverride ?? resolveDeliveryReliable(data.type);

    // Inyectar seq en paquetes Reliable para idempotencia en el receptor
    const outbound = reliable
      ? { ...data, seq: ++this._seq }
      : data;

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(outbound));
      await room.localParticipant.publishData(payload, { reliable });
      return true;
    } catch (error: unknown) {
      log.error('Failed to publish data', {
        type: data.type,
        reliable,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ─── Convenience senders (tipados por paquete) ──────────────────

  async sendReaction(payload: ReactionPayload): Promise<boolean> {
    return this.publish(createReactionDataPacket(payload));
  }

  async sendRecordingStatus(payload: RecordingStatusPayload): Promise<boolean> {
    return this.publish(createRecordingStatusDataPacket(payload));
  }

  async sendConsentRequest(payload: ConsentRequestPayload): Promise<boolean> {
    return this.publish(createConsentRequestDataPacket(payload));
  }

  async sendConsentResponse(payload: ConsentResponsePayload): Promise<boolean> {
    return this.publish(createConsentResponseDataPacket(payload));
  }

  async sendRaiseHand(payload: RaiseHandPayload): Promise<boolean> {
    return this.publish(createRaiseHandDataPacket(payload));
  }

  async sendPinParticipant(payload: PinParticipantPayload): Promise<boolean> {
    return this.publish(createPinParticipantDataPacket(payload));
  }

  async sendSpeakerHint(payload: SpeakerHintPayload): Promise<boolean> {
    return this.publish(createSpeakerHintDataPacket(payload));
  }

  async sendModerationNotice(payload: ModerationNoticePayload): Promise<boolean> {
    return this.publish(createModerationNoticeDataPacket(payload));
  }
}
