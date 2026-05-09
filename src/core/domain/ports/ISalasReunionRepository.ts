/**
 * @module domain/ports/ISalasReunionRepository
 * @description Port para operaciones sobre salas de reunión y sus participantes.
 *
 * Sub-port de `IMeetingRepository` (split 2026-05-09, ITEM 17 fase B).
 * Cubre tabla `salas_reunion` (CRUD + activa flag + obtener por ID) +
 * tabla `participantes_sala` (CRUD).
 */

import type {
  SalaReunionData,
  ParticipanteSalaData,
  DatosCrearSala,
  DatosAgregarParticipanteSala,
} from './IMeetingRepository';

export interface ISalasReunionRepository {
  /** Fetch all meeting rooms for a workspace. */
  obtenerSalas(espacioId: string): Promise<SalaReunionData[]>;

  /** Create a new meeting room. */
  crearSala(datos: DatosCrearSala): Promise<SalaReunionData | null>;

  /** Delete a meeting room by ID. */
  eliminarSala(salaId: string): Promise<boolean>;

  /** Update a room's active status. */
  actualizarSalaActiva(salaId: string, activa: boolean): Promise<boolean>;

  /** Fetch a single room with all relations. */
  obtenerSalaPorId(salaId: string): Promise<SalaReunionData | null>;

  /** Fetch all participants in a room with user details. */
  obtenerParticipantesSala(salaId: string): Promise<ParticipanteSalaData[]>;

  /** Add a participant to a room. */
  agregarParticipanteSala(datos: DatosAgregarParticipanteSala): Promise<ParticipanteSalaData | null>;

  /** Remove a participant from a room. */
  eliminarParticipanteSala(salaId: string, usuarioId: string): Promise<boolean>;
}
