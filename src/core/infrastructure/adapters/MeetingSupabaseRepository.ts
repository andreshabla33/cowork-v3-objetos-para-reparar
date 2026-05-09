/**
 * @module infrastructure/adapters/MeetingSupabaseRepository
 * @description Facade compositor de los 3 sub-adapters Meeting tras el split
 * 2026-05-09 (ITEM 17 fase B):
 *   - `SalasReunionSupabaseRepository` (8 métodos: salas + participantes_sala)
 *   - `ReunionesProgramadasSupabaseRepository` (10 métodos: calendario +
 *     participantes + invitaciones externas)
 *   - `MeetingHelpersSupabaseRepository` (3 métodos: usuarios + cargo)
 *
 * Implementa `IMeetingRepository` (port composición) delegando cada método
 * al sub-adapter apropiado.
 *
 * Compatibilidad: el singleton `meetingRepository` se mantiene exportado con
 * la misma API consumida — 0 cambios en consumers existentes.
 */

import type { IMeetingRepository } from '@/core/domain/ports/IMeetingRepository';
import {
  salasReunionRepository,
  SalasReunionSupabaseRepository,
} from './SalasReunionSupabaseRepository';
import {
  reunionesProgramadasRepository,
  ReunionesProgramadasSupabaseRepository,
} from './ReunionesProgramadasSupabaseRepository';
import {
  meetingHelpersRepository,
  MeetingHelpersSupabaseRepository,
} from './MeetingHelpersSupabaseRepository';

export class MeetingSupabaseRepository implements IMeetingRepository {
  private readonly salas: SalasReunionSupabaseRepository;
  private readonly reuniones: ReunionesProgramadasSupabaseRepository;
  private readonly helpers: MeetingHelpersSupabaseRepository;

  constructor(
    salas: SalasReunionSupabaseRepository = salasReunionRepository as SalasReunionSupabaseRepository,
    reuniones: ReunionesProgramadasSupabaseRepository = reunionesProgramadasRepository as ReunionesProgramadasSupabaseRepository,
    helpers: MeetingHelpersSupabaseRepository = meetingHelpersRepository as MeetingHelpersSupabaseRepository,
  ) {
    this.salas = salas;
    this.reuniones = reuniones;
    this.helpers = helpers;
  }

  // ── ISalasReunionRepository ─────────────────────────────────────────────────
  obtenerSalas = (...args: Parameters<SalasReunionSupabaseRepository['obtenerSalas']>) =>
    this.salas.obtenerSalas(...args);
  crearSala = (...args: Parameters<SalasReunionSupabaseRepository['crearSala']>) =>
    this.salas.crearSala(...args);
  eliminarSala = (...args: Parameters<SalasReunionSupabaseRepository['eliminarSala']>) =>
    this.salas.eliminarSala(...args);
  actualizarSalaActiva = (...args: Parameters<SalasReunionSupabaseRepository['actualizarSalaActiva']>) =>
    this.salas.actualizarSalaActiva(...args);
  obtenerSalaPorId = (...args: Parameters<SalasReunionSupabaseRepository['obtenerSalaPorId']>) =>
    this.salas.obtenerSalaPorId(...args);
  obtenerParticipantesSala = (...args: Parameters<SalasReunionSupabaseRepository['obtenerParticipantesSala']>) =>
    this.salas.obtenerParticipantesSala(...args);
  agregarParticipanteSala = (...args: Parameters<SalasReunionSupabaseRepository['agregarParticipanteSala']>) =>
    this.salas.agregarParticipanteSala(...args);
  eliminarParticipanteSala = (...args: Parameters<SalasReunionSupabaseRepository['eliminarParticipanteSala']>) =>
    this.salas.eliminarParticipanteSala(...args);

  // ── IReunionesProgramadasRepository ─────────────────────────────────────────
  obtenerReuniones = (...args: Parameters<ReunionesProgramadasSupabaseRepository['obtenerReuniones']>) =>
    this.reuniones.obtenerReuniones(...args);
  crearReunion = (...args: Parameters<ReunionesProgramadasSupabaseRepository['crearReunion']>) =>
    this.reuniones.crearReunion(...args);
  actualizarReunion = (...args: Parameters<ReunionesProgramadasSupabaseRepository['actualizarReunion']>) =>
    this.reuniones.actualizarReunion(...args);
  eliminarReunion = (...args: Parameters<ReunionesProgramadasSupabaseRepository['eliminarReunion']>) =>
    this.reuniones.eliminarReunion(...args);
  obtenerReunionPorId = (...args: Parameters<ReunionesProgramadasSupabaseRepository['obtenerReunionPorId']>) =>
    this.reuniones.obtenerReunionPorId(...args);
  agregarParticipanteReunion = (...args: Parameters<ReunionesProgramadasSupabaseRepository['agregarParticipanteReunion']>) =>
    this.reuniones.agregarParticipanteReunion(...args);
  agregarParticipantesReunion = (...args: Parameters<ReunionesProgramadasSupabaseRepository['agregarParticipantesReunion']>) =>
    this.reuniones.agregarParticipantesReunion(...args);
  actualizarRespuestaParticipante = (...args: Parameters<ReunionesProgramadasSupabaseRepository['actualizarRespuestaParticipante']>) =>
    this.reuniones.actualizarRespuestaParticipante(...args);
  actualizarParticipantesNotificados = (...args: Parameters<ReunionesProgramadasSupabaseRepository['actualizarParticipantesNotificados']>) =>
    this.reuniones.actualizarParticipantesNotificados(...args);
  crearInvitacionExterna = (...args: Parameters<ReunionesProgramadasSupabaseRepository['crearInvitacionExterna']>) =>
    this.reuniones.crearInvitacionExterna(...args);

  // ── IMeetingHelpersRepository ───────────────────────────────────────────────
  obtenerMiembrosEspacio = (...args: Parameters<MeetingHelpersSupabaseRepository['obtenerMiembrosEspacio']>) =>
    this.helpers.obtenerMiembrosEspacio(...args);
  obtenerInfoUsuarios = (...args: Parameters<MeetingHelpersSupabaseRepository['obtenerInfoUsuarios']>) =>
    this.helpers.obtenerInfoUsuarios(...args);
  obtenerCargoUsuario = (...args: Parameters<MeetingHelpersSupabaseRepository['obtenerCargoUsuario']>) =>
    this.helpers.obtenerCargoUsuario(...args);
}

/**
 * Singleton facade. Compat con todos los consumers existentes que importan
 * `meetingRepository`.
 */
export const meetingRepository: IMeetingRepository = new MeetingSupabaseRepository();
