/**
 * @module application/usecases/ProcesarGrabacionUseCase
 * @description Use case for post-recording processing.
 * Saves transcription, behavioral analysis, generates AI summary, and creates notification.
 *
 * Clean Architecture: Application layer — orchestrates domain and infrastructure.
 * Ref: Use Case pattern — single responsibility, reusable across components.
 */

import { logger } from '@/lib/logger';
import type {
  IRecordingRepository,
  TranscripcionRecord,
  AnalisisComportamientoRecord,
  GenerarResumenAIData,
  NotificacionAnalisisData,
} from '@/src/core/domain/ports/IRecordingRepository';

const log = logger.child('procesar-grabacion-uc');

/**
 * Manages post-recording processing operations.
 * Handles transcription saving, behavioral analysis, AI summary generation, and notifications.
 */
export class ProcesarGrabacionUseCase {
  constructor(private readonly repo: IRecordingRepository) {}

  /**
   * Save transcription record for a recording.
   * Stores a single transcription segment with timing and optional speaker info.
   *
   * @param data - Transcription parameters (texto, timestamps, speaker_id)
   * @throws Error if insert fails or recording not found
   */
  async guardarTranscripcion(data: TranscripcionRecord): Promise<void> {
    log.info('Saving transcription', { grabacionId: data.grabacion_id, length: data.texto.length });
    await this.repo.guardarTranscripcion(data);
  }

  /**
   * Save behavioral analysis records in batch.
   * Efficiently stores multiple emotion and engagement data points.
   * Typically called after emotion/engagement analysis completes.
   *
   * @param records - Array of behavioral analysis records
   * @throws Error if batch insert fails
   */
  async guardarAnalisis(records: AnalisisComportamientoRecord[]): Promise<void> {
    log.info('Saving behavioral analysis', { count: records.length });
    await this.repo.guardarAnalisisComportamiento(records);
  }

  /**
   * Generate AI summary via Edge Function.
   * Invokes cloud function to process recording data and create summaries.
   * Requires transcription, emotions, and duration context.
   *
   * @param data - Input data for summary generation (grabacion_id, transcription, emotions, etc.)
   * @throws Error if Edge Function call fails
   */
  async generarResumenAI(data: GenerarResumenAIData): Promise<void> {
    log.info('Generating AI summary', { grabacionId: data.grabacion_id });
    await this.repo.generarResumenAI(data);
  }

  /**
   * Create notification for completed analysis.
   * Notifies user when recording analysis and processing finishes.
   *
   * @param data - Notification parameters (usuario_id, titulo, mensaje, entidad_id)
   * @throws Error if insert fails or user not found
   */
  async crearNotificacion(data: NotificacionAnalisisData): Promise<void> {
    log.debug('Creating analysis notification', { userId: data.usuario_id });
    await this.repo.crearNotificacionAnalisis(data);
  }
}
