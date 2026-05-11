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

  /** Fetch only active (fecha_fin >= now) meetings for a workspace. */
  obtenerReunionesActivas(espacioId: string): Promise<ReunionProgramadaData[]>;

  /** Subscribe to postgres_changes on reuniones_programadas filtered by espacio. Returns unsubscribe. */
  suscribirCambiosReuniones(espacioId: string, callback: () => void): () => void;

  /** Actualizar `estado` de participación del usuario actual en una reunión. */
  actualizarMiEstadoReunion(reunionId: string, usuarioId: string, estado: 'aceptado' | 'rechazado' | 'tentativo'): Promise<void>;

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

  /**
   * General (anonymous) invitation link for a sala — participante_id IS NULL.
   * Returns most recent non-expired one, or null.
   */
  obtenerInvitacionGeneralActiva(
    salaId: string,
  ): Promise<{ id: string; token_unico: string; expira_en: string | null; nombre: string | null; tipo_invitado: string | null } | null>;

  /** Update tipo_invitado on an existing general invitation. */
  actualizarTipoInvitadoGeneral(
    invitacionId: string,
    tipoInvitado: string,
  ): Promise<void>;

  /**
   * Crea una invitación general (participante_id null) y devuelve token_unico.
   */
  crearInvitacionGeneral(input: {
    sala_id: string;
    tipo_invitado: string;
    creado_por: string | null;
    expira_en: string;
  }): Promise<{ token_unico: string } | null>;
}
