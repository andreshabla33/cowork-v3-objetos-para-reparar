/**
 * @module infrastructure/adapters/ChatSupabaseRepository
 * @description Facade compositor de los 2 sub-adapters Chat tras el split
 * 2026-05-09 (ITEM 17 fase B):
 *   - `SpaceChatSupabaseRepository` (17 métodos: canales, DMs, miembros, files)
 *   - `MeetingChatSupabaseRepository` (6 métodos: chat de salas legacy)
 *
 * Implementa `IChatRepository` (port composición de `ISpaceChatRepository` +
 * `IMeetingChatRepository`) delegando cada método al sub-adapter apropiado.
 *
 * Compatibilidad: el singleton `chatRepository` se mantiene exportado con la
 * misma API consumida por todos los call sites previos (no rompe consumers).
 *
 * Migración: nuevos consumers que solo necesiten un sub-bounded pueden
 * importar `spaceChatRepository` o `meetingChatRepository` directamente
 * desde sus respectivos módulos para reducir la superficie inyectada.
 */

import type { IChatRepository } from '@/core/domain/ports/IChatRepository';
import { spaceChatRepository, SpaceChatSupabaseRepository } from './SpaceChatSupabaseRepository';
import { meetingChatRepository, MeetingChatSupabaseRepository } from './MeetingChatSupabaseRepository';

export class ChatSupabaseRepository implements IChatRepository {
  private readonly space: SpaceChatSupabaseRepository;
  private readonly meeting: MeetingChatSupabaseRepository;

  constructor(
    space: SpaceChatSupabaseRepository = spaceChatRepository as SpaceChatSupabaseRepository,
    meeting: MeetingChatSupabaseRepository = meetingChatRepository as MeetingChatSupabaseRepository,
  ) {
    this.space = space;
    this.meeting = meeting;
  }

  // ── ISpaceChatRepository delegación ─────────────────────────────────────────
  obtenerGrupos = (...args: Parameters<SpaceChatSupabaseRepository['obtenerGrupos']>) =>
    this.space.obtenerGrupos(...args);
  obtenerInfoGrupo = (...args: Parameters<SpaceChatSupabaseRepository['obtenerInfoGrupo']>) =>
    this.space.obtenerInfoGrupo(...args);
  crearGrupo = (...args: Parameters<SpaceChatSupabaseRepository['crearGrupo']>) =>
    this.space.crearGrupo(...args);
  eliminarGrupo = (...args: Parameters<SpaceChatSupabaseRepository['eliminarGrupo']>) =>
    this.space.eliminarGrupo(...args);
  eliminarMiembrosGrupo = (...args: Parameters<SpaceChatSupabaseRepository['eliminarMiembrosGrupo']>) =>
    this.space.eliminarMiembrosGrupo(...args);
  eliminarMensajesGrupo = (...args: Parameters<SpaceChatSupabaseRepository['eliminarMensajesGrupo']>) =>
    this.space.eliminarMensajesGrupo(...args);
  obtenerMiembrosCanal = (...args: Parameters<SpaceChatSupabaseRepository['obtenerMiembrosCanal']>) =>
    this.space.obtenerMiembrosCanal(...args);
  agregarMiembroCanal = (...args: Parameters<SpaceChatSupabaseRepository['agregarMiembroCanal']>) =>
    this.space.agregarMiembroCanal(...args);
  agregarMiembrosCanal = (...args: Parameters<SpaceChatSupabaseRepository['agregarMiembrosCanal']>) =>
    this.space.agregarMiembrosCanal(...args);
  agregarMiembrosDM = (...args: Parameters<SpaceChatSupabaseRepository['agregarMiembrosDM']>) =>
    this.space.agregarMiembrosDM(...args);
  obtenerMiembrosEspacio = (...args: Parameters<SpaceChatSupabaseRepository['obtenerMiembrosEspacio']>) =>
    this.space.obtenerMiembrosEspacio(...args);
  obtenerMensajes = (...args: Parameters<SpaceChatSupabaseRepository['obtenerMensajes']>) =>
    this.space.obtenerMensajes(...args);
  obtenerHilo = (...args: Parameters<SpaceChatSupabaseRepository['obtenerHilo']>) =>
    this.space.obtenerHilo(...args);
  enviarMensaje = (...args: Parameters<SpaceChatSupabaseRepository['enviarMensaje']>) =>
    this.space.enviarMensaje(...args);
  obtenerOCrearChatDirecto = (...args: Parameters<SpaceChatSupabaseRepository['obtenerOCrearChatDirecto']>) =>
    this.space.obtenerOCrearChatDirecto(...args);
  contarRespuestas = (...args: Parameters<SpaceChatSupabaseRepository['contarRespuestas']>) =>
    this.space.contarRespuestas(...args);
  subirArchivo = (...args: Parameters<SpaceChatSupabaseRepository['subirArchivo']>) =>
    this.space.subirArchivo(...args);

  // ── IMeetingChatRepository delegación ───────────────────────────────────────
  obtenerOCrearGrupoChatReunion = (...args: Parameters<MeetingChatSupabaseRepository['obtenerOCrearGrupoChatReunion']>) =>
    this.meeting.obtenerOCrearGrupoChatReunion(...args);
  obtenerHistorialMensajes = (...args: Parameters<MeetingChatSupabaseRepository['obtenerHistorialMensajes']>) =>
    this.meeting.obtenerHistorialMensajes(...args);
  insertarMensaje = (...args: Parameters<MeetingChatSupabaseRepository['insertarMensaje']>) =>
    this.meeting.insertarMensaje(...args);
  suscribirMensajesNuevos = (...args: Parameters<MeetingChatSupabaseRepository['suscribirMensajesNuevos']>) =>
    this.meeting.suscribirMensajesNuevos(...args);
  obtenerNombreUsuario = (...args: Parameters<MeetingChatSupabaseRepository['obtenerNombreUsuario']>) =>
    this.meeting.obtenerNombreUsuario(...args);
  resolverUsuarioParticipante = (...args: Parameters<MeetingChatSupabaseRepository['resolverUsuarioParticipante']>) =>
    this.meeting.resolverUsuarioParticipante(...args);
}

/**
 * Singleton facade. Se mantiene como alias compat — todos los consumers
 * existentes que importan `chatRepository` siguen funcionando idénticamente.
 */
export const chatRepository: IChatRepository = new ChatSupabaseRepository();
