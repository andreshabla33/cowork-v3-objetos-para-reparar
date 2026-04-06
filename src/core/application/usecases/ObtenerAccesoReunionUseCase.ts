/**
 * @module application/usecases/ObtenerAccesoReunionUseCase
 * @description Use case for meeting room access operations.
 * Handles sala info lookup, invitation validation, LiveKit token provisioning,
 * heartbeat, participant status, moderation, and permissions.
 */
import { logger } from '@/lib/logger';
import type {
  IMeetingAccessRepository,
  SalaInfoRecord,
  InvitacionValidada,
  TokenDataRecord,
  SolicitarTokenData,
  PermisosInvitado,
  ModerarParticipanteData,
  ActualizarEstadoParticipanteData,
  CargoRolData,
} from '@/src/core/domain/ports/IMeetingAccessRepository';

const log = logger.child('obtener-acceso-reunion-uc');

export class ObtenerAccesoReunionUseCase {
  constructor(private readonly repo: IMeetingAccessRepository) {}

  /** Validate meeting invitation token */
  async validarInvitacion(token: string): Promise<InvitacionValidada> {
    log.info('Validating meeting invitation');
    return this.repo.validarInvitacion(token);
  }

  /** Fetch sala info by access code */
  async obtenerSalaPorCodigo(
    codigoAcceso: string
  ): Promise<SalaInfoRecord | null> {
    log.debug('Fetching sala by code', { codigoAcceso });
    return this.repo.obtenerSalaPorCodigo(codigoAcceso);
  }

  /** Fetch sala info by ID */
  async obtenerSalaPorId(salaId: string): Promise<SalaInfoRecord | null> {
    log.debug('Fetching sala by ID', { salaId });
    return this.repo.obtenerSalaPorId(salaId);
  }

  /** Get espacio_id from a sala */
  async obtenerEspacioIdDeSala(salaId: string): Promise<string | null> {
    return this.repo.obtenerEspacioIdDeSala(salaId);
  }

  /** Get creator display name */
  async obtenerNombreCreador(creadorId: string): Promise<string> {
    return this.repo.obtenerNombreCreador(creadorId);
  }

  /** Request LiveKit room token */
  async solicitarToken(
    data: SolicitarTokenData,
    accessToken?: string
  ): Promise<TokenDataRecord> {
    log.info('Requesting LiveKit token', { guest: !!data.token_invitacion });
    return this.repo.solicitarTokenLiveKit(data, accessToken);
  }

  /** Send heartbeat for participant presence */
  async heartbeat(salaId: string, userId: string): Promise<void> {
    await this.repo.heartbeatParticipante(salaId, userId);
  }

  /** Update participant status */
  async actualizarEstado(
    salaId: string,
    userId: string,
    data: ActualizarEstadoParticipanteData
  ): Promise<void> {
    log.debug('Updating participant status', {
      salaId,
      estado: data.estado_participante,
    });
    await this.repo.actualizarEstadoParticipante(salaId, userId, data);
  }

  /** Moderate a participant (e.g., mute) */
  async moderar(data: ModerarParticipanteData): Promise<void> {
    log.info('Moderating participant', {
      action: data.action,
      participant: data.participant_identity,
    });
    await this.repo.moderarParticipante(data);
  }

  /** Get guest permissions for a workspace */
  async obtenerPermisosInvitado(espacioId: string): Promise<PermisosInvitado> {
    return this.repo.obtenerPermisosInvitado(espacioId);
  }

  /** Get user cargo and role */
  async obtenerCargoUsuario(
    userId: string,
    espacioId: string
  ): Promise<CargoRolData> {
    return this.repo.obtenerCargoUsuario(userId, espacioId);
  }
}
