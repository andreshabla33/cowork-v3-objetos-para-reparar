/**
 * RealtimeEventParser — Servicio de aplicación para decodificación de DataReceived.
 *
 * Centraliza la lógica duplicada de:
 * 1. Decodificar Uint8Array → string → JSON
 * 2. Validar contra DataPacketContract
 * 3. Emitir al RealtimeEventBus
 * 4. Notificar callbacks
 *
 * Usado por composición en SpaceRealtimeCoordinator y LiveKitRoomGateway.
 */

import type { RemoteParticipant } from 'livekit-client';
import { logger } from '@/lib/logger';
import { type DataPacketContract, parseDataPacketContract } from '../domain/types';
import type { RealtimeEventBus } from './RealtimeEventBus';

export type OnDataReceivedCallback = (data: DataPacketContract, participant?: RemoteParticipant) => void;

const log = logger.child('realtime-event-parser');

export class RealtimeEventParser {
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly eventBus: RealtimeEventBus,
    private readonly onDataReceived?: OnDataReceivedCallback,
  ) {}

  /**
   * Procesa el payload crudo de RoomEvent.DataReceived.
   * Retorna el paquete parseado o null si es inválido.
   */
  handleRawPayload(rawPayload: Uint8Array, participant?: RemoteParticipant): DataPacketContract | null {
    try {
      const raw: unknown = JSON.parse(this.decoder.decode(rawPayload));
      const data = parseDataPacketContract(raw);

      if (!data) {
        const rawType = typeof raw === 'object' && raw !== null && 'type' in raw
          ? String((raw as Record<string, unknown>).type)
          : 'unknown';
        log.debug('Ignoring unrecognized data packet', {
          packetType: rawType,
          from: participant?.identity ?? 'unknown',
        });
        return null;
      }

      this.eventBus.emit(data, participant?.identity);
      this.onDataReceived?.(data, participant);
      return data;
    } catch (error: unknown) {
      log.warn('Failed to parse received data', {
        error: error instanceof Error ? error.message : String(error),
        from: participant?.identity ?? 'unknown',
      });
      return null;
    }
  }
}
