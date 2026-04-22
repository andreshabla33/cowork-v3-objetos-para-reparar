/**
 * @module infrastructure/adapters/LiveKitMoveParticipantSupabaseAdapter
 *
 * Clean Architecture — Infrastructure layer.
 *
 * Implementa el puerto `IRoomMoveService` invocando la Supabase Edge Function
 * `livekit-move-participant` (que a su vez usa LiveKit server SDK con admin
 * credentials para llamar `RoomServiceClient.moveParticipant`).
 *
 * Mapping HTTP → RoomMoveError tipado del Application port.
 *
 * Refs:
 *  - Port: IRoomMoveService (src/core/application/usecases/MoveToMeetingRoomUseCase.ts)
 *  - Edge Function: supabase/functions/livekit-move-participant/index.ts
 *  - LiveKit moveParticipant: https://docs.livekit.io/home/server/managing-rooms/
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IRoomMoveService,
  MoveServiceResult,
} from '../../application/usecases/MoveToMeetingRoomUseCase';
import type {
  ParticipantIdentity,
  RoomName,
} from '../../domain/entities/realtime/MeetingRoomAssignment';

/**
 * Adapter que usa Supabase Functions invoke para llamar a
 * `livekit-move-participant`.
 */
export class LiveKitMoveParticipantSupabaseAdapter implements IRoomMoveService {
  constructor(private readonly supabase: SupabaseClient) {}

  async moveParticipant(input: {
    identity: ParticipantIdentity;
    fromRoom: RoomName;
    toRoom: RoomName;
  }): Promise<MoveServiceResult> {
    // Idempotencia a nivel cliente: si from === to, no-op.
    if (input.fromRoom === input.toRoom) {
      return { ok: true };
    }

    try {
      const { data, error } = await this.supabase.functions.invoke(
        'livekit-move-participant',
        {
          body: {
            identity: input.identity,
            from_room: input.fromRoom,
            to_room: input.toRoom,
          },
        },
      );

      if (error) {
        return this.mapFunctionError(error, data);
      }

      if (!data?.ok) {
        return {
          ok: false,
          error: { code: 'UNKNOWN', detail: 'Edge function returned no ok flag' },
        };
      }

      return { ok: true };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'NETWORK_ERROR', detail } };
    }
  }

  /** Traduce respuesta de error de la Edge Function → RoomMoveError del dominio. */
  private mapFunctionError(error: unknown, data: unknown): MoveServiceResult {
    const errorCode = this.extractErrorCode(data) ?? this.extractErrorCode(error);
    const detail = this.extractDetail(data) ?? this.extractDetail(error);

    switch (errorCode) {
      case 'UNAUTHORIZED':
        return { ok: false, error: { code: 'UNAUTHORIZED' } };
      case 'FORBIDDEN':
        return { ok: false, error: { code: 'UNAUTHORIZED' } }; // colapsa 403 a UNAUTHORIZED
      case 'PARTICIPANT_NOT_FOUND':
        return {
          ok: false,
          error: { code: 'PARTICIPANT_NOT_FOUND', identity: '' },
        };
      case 'LIVEKIT_API_ERROR':
        return { ok: false, error: { code: 'LIVEKIT_API_ERROR', detail } };
      case 'INVALID_REQUEST':
        return { ok: false, error: { code: 'UNKNOWN', detail } };
      default:
        return { ok: false, error: { code: 'UNKNOWN', detail } };
    }
  }

  private extractErrorCode(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as { error?: unknown; code?: unknown };
    if (typeof v.error === 'string') return v.error;
    if (typeof v.code === 'string') return v.code;
    return null;
  }

  private extractDetail(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as { detail?: unknown; message?: unknown };
    if (typeof v.detail === 'string') return v.detail;
    if (typeof v.message === 'string') return v.message;
    return undefined;
  }
}
