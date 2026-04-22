/**
 * @module domain/entities/realtime/MeetingRoomAssignment
 *
 * Clean Architecture — Domain layer (puro, sin React/LiveKit/Supabase).
 *
 * Value object + funciones puras para asignar a un participante a una
 * Room dedicada de LiveKit cuando entra a una zona tipo meeting (sala de
 * juntas, mega meeting, etc.). Implementa el patrón de aislamiento por
 * múltiples Rooms recomendado por LiveKit oficial.
 *
 * Refs oficiales:
 *  - LiveKit Room management — moveParticipant API:
 *    https://docs.livekit.io/home/server/managing-rooms/
 *  - LiveKit Subscribing tracks (autoSubscribe + setSubscribed):
 *    https://docs.livekit.io/home/client/tracks/subscribe/
 *  - Spatial computing use case (multi-Room para zonas privadas):
 *    https://livekit.com/use-cases/spatial-computing
 *
 * Clean Architecture refs:
 *  - Robert C. Martin — "Clean Architecture": dependencies point inward.
 *    https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
 *  - Khalil Stemmler — "Organizing App Logic":
 *    https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/
 */

// ─── Value objects ──────────────────────────────────────────────────────────

/** Nombre de Room en LiveKit. Formato: `<espacioId>_global` o `<espacioId>_meeting_<zonaId>`. */
export type RoomName = string;

/** Identidad del participante en LiveKit (típicamente `user.id`). */
export type ParticipantIdentity = string;

/** Identificador de zona en `zonas_empresa` (UUID). */
export type ZoneId = string;

/** Identificador de espacio en `espacios_trabajo` (UUID). */
export type EspacioId = string;

/** Plantillas de zona consideradas "meeting" (aisladas en su propia Room). */
export type MeetingPlantillaId = 'sala_juntas' | 'sala_meeting_grande';

/** Lista canónica de plantillas que merecen Room dedicada. */
export const MEETING_PLANTILLAS: readonly MeetingPlantillaId[] = [
  'sala_juntas',
  'sala_meeting_grande',
] as const;

/**
 * Asignación inmutable de un participante a una Room. Construida solo via
 * factory para garantizar invariantes (no Room name vacío, no identity vacío).
 */
export interface MeetingRoomAssignment {
  readonly identity: ParticipantIdentity;
  readonly fromRoom: RoomName;
  readonly toRoom: RoomName;
  readonly zoneId: ZoneId | null; // null cuando se vuelve a global
  readonly espacioId: EspacioId;
  readonly reason: 'enter_meeting' | 'leave_meeting';
}

// ─── Result type (sin dep externa, consistente con PerimeterPolicy.ts) ──────

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ─── Errores tipados del dominio ────────────────────────────────────────────

export type MeetingAssignmentError =
  | { code: 'EMPTY_IDENTITY' }
  | { code: 'EMPTY_ESPACIO_ID' }
  | { code: 'EMPTY_ZONE_ID' }
  | { code: 'INVALID_FROM_ROOM' }
  | { code: 'INVALID_TO_ROOM' }
  | { code: 'SAME_ROOM'; room: RoomName };

// ─── Convención de nombres de Room ──────────────────────────────────────────

/**
 * Nombre canónico de la Room global del espacio.
 * Convención: `<espacioId>_global`.
 *
 * IMPORTANTE: el frontend ya usa el nombre `espacio_<espacioId>` en
 * `livekit-token` edge function. Conservamos esa convención para no romper
 * la compat con la Room actual — el "global" es el espacio principal.
 */
export function deriveGlobalRoomName(espacioId: EspacioId): RoomName {
  return `espacio_${espacioId}`;
}

/**
 * Nombre canónico de la Room dedicada para una meeting zone.
 * Convención: `espacio_<espacioId>_meeting_<zonaId>`.
 *
 * Determinista: misma zona siempre genera el mismo nombre → evita
 * duplicados de Rooms y permite reconnect después de refresh.
 */
export function deriveMeetingRoomName(
  espacioId: EspacioId,
  zoneId: ZoneId,
): RoomName {
  return `espacio_${espacioId}_meeting_${zoneId}`;
}

// ─── Predicate puro: ¿es una meeting zone? ──────────────────────────────────

/**
 * Determina si una zona requiere ser tratada como meeting room dedicada
 * basándose en su `configuracion.plantilla_zona.id`.
 *
 * Sólo `sala_juntas` y `sala_meeting_grande` requieren Room dedicada.
 * Otras zonas (cubiculo, focus, comedor, bano) NO — comparten la Room
 * global del espacio y se filtran por proximidad/audio espacial.
 */
export function isMeetingZone(zonaConfig: unknown): boolean {
  if (!zonaConfig || typeof zonaConfig !== 'object') return false;
  const cfg = zonaConfig as { plantilla_zona?: { id?: unknown } };
  const plantillaId = cfg.plantilla_zona?.id;
  return typeof plantillaId === 'string'
    && (MEETING_PLANTILLAS as readonly string[]).includes(plantillaId);
}

// ─── Factories de MeetingRoomAssignment (validadas) ─────────────────────────

/**
 * Construye una asignación para ENTRAR a una meeting zone.
 * El `fromRoom` es la global del espacio; el `toRoom` es la dedicada de la zona.
 */
export function buildEnterMeetingAssignment(input: {
  identity: ParticipantIdentity;
  espacioId: EspacioId;
  zoneId: ZoneId;
}): Result<MeetingRoomAssignment, MeetingAssignmentError> {
  if (!input.identity || input.identity.trim() === '') {
    return err({ code: 'EMPTY_IDENTITY' });
  }
  if (!input.espacioId || input.espacioId.trim() === '') {
    return err({ code: 'EMPTY_ESPACIO_ID' });
  }
  if (!input.zoneId || input.zoneId.trim() === '') {
    return err({ code: 'EMPTY_ZONE_ID' });
  }
  const fromRoom = deriveGlobalRoomName(input.espacioId);
  const toRoom = deriveMeetingRoomName(input.espacioId, input.zoneId);
  if (fromRoom === toRoom) {
    return err({ code: 'SAME_ROOM', room: fromRoom });
  }
  return ok({
    identity: input.identity,
    fromRoom,
    toRoom,
    zoneId: input.zoneId,
    espacioId: input.espacioId,
    reason: 'enter_meeting',
  });
}

/**
 * Construye una asignación para SALIR de una meeting zone (volver a global).
 * El `fromRoom` es la dedicada de la zona; el `toRoom` es la global del espacio.
 */
export function buildLeaveMeetingAssignment(input: {
  identity: ParticipantIdentity;
  espacioId: EspacioId;
  fromZoneId: ZoneId;
}): Result<MeetingRoomAssignment, MeetingAssignmentError> {
  if (!input.identity || input.identity.trim() === '') {
    return err({ code: 'EMPTY_IDENTITY' });
  }
  if (!input.espacioId || input.espacioId.trim() === '') {
    return err({ code: 'EMPTY_ESPACIO_ID' });
  }
  if (!input.fromZoneId || input.fromZoneId.trim() === '') {
    return err({ code: 'EMPTY_ZONE_ID' });
  }
  const fromRoom = deriveMeetingRoomName(input.espacioId, input.fromZoneId);
  const toRoom = deriveGlobalRoomName(input.espacioId);
  if (fromRoom === toRoom) {
    return err({ code: 'SAME_ROOM', room: fromRoom });
  }
  return ok({
    identity: input.identity,
    fromRoom,
    toRoom,
    zoneId: null,
    espacioId: input.espacioId,
    reason: 'leave_meeting',
  });
}

// ─── Namespace export ───────────────────────────────────────────────────────

export const MeetingRoomAssignment = {
  deriveGlobalRoomName,
  deriveMeetingRoomName,
  isMeetingZone,
  buildEnterMeetingAssignment,
  buildLeaveMeetingAssignment,
  MEETING_PLANTILLAS,
} as const;
