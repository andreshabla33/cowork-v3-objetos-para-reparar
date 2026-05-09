/**
 * @module domain/ports/IReunionesProgramadasRepository
 * @description Port para reuniones programadas (calendario) + sus participantes
 * + invitaciones externas.
 *
 * Sub-port de `IMeetingRepository` (split 2026-05-09, ITEM 17 fase B).
 * Cubre tablas `reuniones_programadas`, `reunion_participantes` y
 * `invitaciones_reunion`.
 */

import type {
  ReunionProgramadaData,
  ParticipanteReunionData,
  DatosCrearReunion,
  DatosAgregarParticipante,
  DatosCrearInvitacionExterna,
} from './IMeetingRepository';

export interface IReunionesProgramadasRepository {
  /** Fetch all scheduled meetings for a workspace, ordered by start date. */
  obtenerReuniones(espacioId: string): Promise<ReunionProgramadaData[]>;

  /** Create a new scheduled meeting. */
  crearReunion(datos: DatosCrearReunion): Promise<ReunionProgramadaData | null>;

  /** Update a scheduled meeting (partial update). */
  actualizarReunion(reunionId: string, datos: Partial<ReunionProgramadaData>): Promise<boolean>;

  /** Delete a scheduled meeting by ID. */
  eliminarReunion(reunionId: string): Promise<boolean>;

  /** Fetch a single scheduled meeting with all relations. */
  obtenerReunionPorId(reunionId: string): Promise<ReunionProgramadaData | null>;

  /** Add a participant to a meeting. */
  agregarParticipanteReunion(datos: DatosAgregarParticipante): Promise<ParticipanteReunionData | null>;

  /** Batch add participants to a meeting. */
  agregarParticipantesReunion(
    reunionId: string,
    participantes: Array<{ usuario_id: string; estado?: string }>,
  ): Promise<boolean>;

  /** Update participant response status for a meeting. */
  actualizarRespuestaParticipante(
    reunionId: string,
    usuarioId: string,
    estado: 'aceptado' | 'rechazado' | 'tentativo',
  ): Promise<boolean>;

  /** Mark all meeting participants as notified. */
  actualizarParticipantesNotificados(reunionId: string): Promise<boolean>;

  /** Create an external invitation token for a meeting room. */
  crearInvitacionExterna(
    datos: DatosCrearInvitacionExterna,
  ): Promise<{ id: string; token: string } | null>;
}
