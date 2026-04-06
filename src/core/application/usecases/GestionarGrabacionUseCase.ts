/**
 * @module application/usecases/GestionarGrabacionUseCase
 * @description Use case for managing recording lifecycle.
 * Handles creation, completion, error marking, consent, and participant registration.
 *
 * Clean Architecture: Application layer — orchestrates domain and infrastructure.
 * Ref: Use Case pattern — single responsibility, reusable across components.
 */

import { logger } from '@/lib/logger';
import type {
  IRecordingRepository,
  CrearGrabacionData,
  CompletarGrabacionData,
  ErrorGrabacionData,
  ConsentimientoGrabacionData,
  ParticipanteGrabacionRecord,
} from '@/src/core/domain/ports/IRecordingRepository';

const log = logger.child('gestionar-grabacion-uc');

/**
 * Manages recording lifecycle operations.
 * Handles creation, completion, error marking, consent updates, and participant registration.
 */
export class GestionarGrabacionUseCase {
  constructor(private readonly repo: IRecordingRepository) {}

  /**
   * Create a new recording session.
   * Initializes a recording in 'grabando' state.
   *
   * @param data - Recording creation parameters
   * @throws Error if database insert fails
   */
  async crearGrabacion(data: CrearGrabacionData): Promise<void> {
    log.info('Creating recording', { id: data.id, tipo: data.tipo });
    await this.repo.crearGrabacion(data);
  }

  /**
   * Complete a recording session.
   * Transitions recording from 'grabando' to 'completado' state.
   *
   * @param grabacionId - Recording ID to complete
   * @param data - Completion parameters (duracion, fin_grabacion, archivo_nombre)
   * @throws Error if update fails or recording not found
   */
  async completarGrabacion(grabacionId: string, data: CompletarGrabacionData): Promise<void> {
    log.info('Completing recording', { grabacionId });
    await this.repo.completarGrabacion(grabacionId, data);
  }

  /**
   * Mark a recording as error.
   * Transitions recording to 'error' state with error message.
   *
   * @param grabacionId - Recording ID to mark as error
   * @param data - Error parameters (error_mensaje)
   * @throws Error if update fails or recording not found
   */
  async marcarError(grabacionId: string, data: ErrorGrabacionData): Promise<void> {
    log.warn('Marking recording as error', { grabacionId, error: data.error_mensaje });
    await this.repo.marcarGrabacionError(grabacionId, data);
  }

  /**
   * Update consent status on a recording.
   * Records when an evaluated user grants or denies consent.
   *
   * @param grabacionId - Recording ID
   * @param data - Consent parameters (consentimiento_evaluado, fecha)
   * @throws Error if update fails or recording not found
   */
  async actualizarConsentimiento(
    grabacionId: string,
    data: ConsentimientoGrabacionData,
  ): Promise<void> {
    log.info('Updating consent', { grabacionId, accepted: data.consentimiento_evaluado });
    await this.repo.actualizarConsentimiento(grabacionId, data);
  }

  /**
   * Request consent from evaluated user.
   * Initiates consent request flow via RPC to backend procedure.
   *
   * @param grabacionId - Recording ID
   * @param evaluadoId - User ID of evaluated person
   * @param tipoGrabacion - Recording type identifier
   * @throws Error if RPC call fails or user not found
   */
  async solicitarConsentimiento(
    grabacionId: string,
    evaluadoId: string,
    tipoGrabacion: string,
  ): Promise<void> {
    log.info('Requesting consent', { grabacionId, evaluadoId });
    await this.repo.solicitarConsentimientoGrabacion(grabacionId, evaluadoId, tipoGrabacion);
  }

  /**
   * Register a participant in a recording.
   * Links a user to a recording session with consent metadata.
   *
   * @param data - Participant registration parameters
   * @throws Error if insert fails or foreign key constraint violated
   */
  async registrarParticipante(data: ParticipanteGrabacionRecord): Promise<void> {
    log.debug('Registering participant', { grabacionId: data.grabacion_id, userId: data.usuario_id });
    await this.repo.registrarParticipante(data);
  }
}
