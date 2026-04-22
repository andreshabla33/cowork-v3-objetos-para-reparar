/**
 * @module application/usecases/MoveToMeetingRoomUseCase
 *
 * Clean Architecture — Application layer.
 *
 * Caso de uso: mover un participante entre Rooms de LiveKit (global ↔
 * meeting dedicada) cuando entra o sale de una zona tipo meeting.
 *
 * Principios aplicados:
 *  - Ports & Adapters (Cockburn): el `IRoomMoveService` es el puerto;
 *    los adapters (Supabase Edge Function, test double, etc.) lo implementan.
 *  - Inward dependency rule: solo importa Domain, NUNCA Infrastructure.
 *  - Result<T, E> pattern: errores tipados en vez de throw.
 *
 * Refs:
 *  - https://docs.livekit.io/home/server/managing-rooms/ (moveParticipant)
 *  - https://alistair.cockburn.us/hexagonal-architecture/
 *  - https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/
 */

import {
  buildEnterMeetingAssignment,
  buildLeaveMeetingAssignment,
  type MeetingRoomAssignment,
  type MeetingAssignmentError,
  type ParticipantIdentity,
  type EspacioId,
  type ZoneId,
  type RoomName,
} from '../../domain/entities/realtime/MeetingRoomAssignment';

// ─── Port (interface) ───────────────────────────────────────────────────────

/** Errores que puede retornar el adapter de movimiento de participante. */
export type RoomMoveError =
  | { code: 'NETWORK_ERROR'; detail?: string }
  | { code: 'UNAUTHORIZED' }
  | { code: 'PARTICIPANT_NOT_FOUND'; identity: ParticipantIdentity }
  | { code: 'ROOM_NOT_FOUND'; room: RoomName }
  | { code: 'LIVEKIT_API_ERROR'; status?: number; detail?: string }
  | { code: 'UNKNOWN'; detail?: string };

/** Puerto abstracto — implementado por el adapter de infrastructure. */
export interface IRoomMoveService {
  /**
   * Mueve un participante entre Rooms vía `moveParticipant` API de LiveKit.
   *
   * Contratos:
   *  - Si la operación es idempotente (el participante ya está en `toRoom`),
   *    debe retornar ok sin error.
   *  - El cliente LiveKit recibirá automáticamente `RoomEvent.Reconnecting`
   *    y luego `Connected` con un nuevo token — sin código adicional.
   *
   * Ref: https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html
   */
  moveParticipant(input: {
    identity: ParticipantIdentity;
    fromRoom: RoomName;
    toRoom: RoomName;
  }): Promise<MoveServiceResult>;
}

export type MoveServiceResult =
  | { ok: true }
  | { ok: false; error: RoomMoveError };

// ─── Use case outputs ───────────────────────────────────────────────────────

export type MoveToMeetingRoomResult =
  | { ok: true; assignment: MeetingRoomAssignment }
  | { ok: false; error: MeetingAssignmentError | RoomMoveError };

// ─── Use case: ENTRAR a meeting zone ────────────────────────────────────────

export class MoveToMeetingRoomUseCase {
  constructor(private readonly svc: IRoomMoveService) {}

  /**
   * Ejecuta el movimiento del participante a la Room dedicada de la zona.
   * Orquestación:
   *  1. Construye la `MeetingRoomAssignment` (Domain factory — valida invariantes).
   *  2. Llama al puerto `IRoomMoveService.moveParticipant()`.
   *  3. Retorna el Result con la asignación o el error tipado.
   */
  async execute(input: {
    identity: ParticipantIdentity;
    espacioId: EspacioId;
    zoneId: ZoneId;
  }): Promise<MoveToMeetingRoomResult> {
    const assignmentResult = buildEnterMeetingAssignment({
      identity: input.identity,
      espacioId: input.espacioId,
      zoneId: input.zoneId,
    });

    if (!assignmentResult.ok) {
      return { ok: false, error: assignmentResult.error };
    }

    const assignment = assignmentResult.value;

    const moveResult = await this.svc.moveParticipant({
      identity: assignment.identity,
      fromRoom: assignment.fromRoom,
      toRoom: assignment.toRoom,
    });

    if (!moveResult.ok) {
      return { ok: false, error: moveResult.error };
    }

    return { ok: true, assignment };
  }
}

// ─── Use case: SALIR de meeting zone (volver a global) ──────────────────────

export class ReturnToGlobalRoomUseCase {
  constructor(private readonly svc: IRoomMoveService) {}

  async execute(input: {
    identity: ParticipantIdentity;
    espacioId: EspacioId;
    fromZoneId: ZoneId;
  }): Promise<MoveToMeetingRoomResult> {
    const assignmentResult = buildLeaveMeetingAssignment(input);

    if (!assignmentResult.ok) {
      return { ok: false, error: assignmentResult.error };
    }

    const assignment = assignmentResult.value;

    const moveResult = await this.svc.moveParticipant({
      identity: assignment.identity,
      fromRoom: assignment.fromRoom,
      toRoom: assignment.toRoom,
    });

    if (!moveResult.ok) {
      return { ok: false, error: moveResult.error };
    }

    return { ok: true, assignment };
  }
}
