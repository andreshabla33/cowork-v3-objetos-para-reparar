/**
 * @module application/usecases/CargarHistorialGrabacionesUseCase
 * @description Use case for loading recording history with related data.
 * Combines creator recordings, participant recordings, and related data for GrabacionesHistorial.
 *
 * Clean Architecture: Application layer — orchestrates domain and infrastructure.
 * Ref: Use Case pattern — single responsibility, reusable across components.
 */

import { logger } from '@/lib/logger';
import type {
  IRecordingRepository,
  GrabacionConDatos,
  CargoYRolUsuario,
} from '@/src/core/domain/ports/IRecordingRepository';

const log = logger.child('cargar-historial-grabaciones-uc');

/**
 * Manages loading and enrichment of recording history.
 * Combines recordings where user is creator and participant, loads related data.
 */
export class CargarHistorialGrabacionesUseCase {
  constructor(private readonly repo: IRecordingRepository) {}

  /**
   * Load all recordings for a user in a workspace.
   * Combines recordings where user is creator and participant, sorted by date descending.
   *
   * @param espacioId - Workspace ID
   * @param userId - User ID
   * @returns Array of recordings with esCreador and esParticipante flags
   * @throws Error if query fails
   */
  async execute(espacioId: string, userId: string): Promise<GrabacionConDatos[]> {
    log.info('Loading recording history', { espacioId, userId });

    // 1. Get recordings created by user
    const grabacionesCreador = await this.repo.obtenerGrabacionesCreador(espacioId, userId);

    // 2. Get recordings where user is participant
    const idsParticipante = await this.repo.obtenerGrabacionesParticipante(userId);
    let grabacionesParticipante = [];
    if (idsParticipante.length > 0) {
      grabacionesParticipante = await this.repo.obtenerGrabacionesPorIds(
        espacioId,
        idsParticipante,
        userId,
      );
    }

    // 3. Combine and sort by date (descending)
    const todas: GrabacionConDatos[] = [
      ...grabacionesCreador.map(g => ({ ...g, esCreador: true, esParticipante: false })),
      ...grabacionesParticipante.map(g => ({ ...g, esCreador: false, esParticipante: true })),
    ];
    todas.sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());

    log.debug('Recording history loaded', { total: todas.length });
    return todas;
  }

  /**
   * Enrich recordings with related data (transcriptions, analysis, summaries).
   * Loads dependent data for each recording in parallel.
   * Useful for detailed views where related data is needed.
   *
   * @param grabaciones - Array of recordings to enrich
   * @returns Enriched recordings with transcripciones, analisis_comportamiento, resumenes_ai
   * @throws Error if query fails for any recording
   */
  async enriquecerConDatos(grabaciones: GrabacionConDatos[]): Promise<GrabacionConDatos[]> {
    log.debug('Enriching recordings with related data', { count: grabaciones.length });

    return Promise.all(
      grabaciones.map(async grabacion => {
        const datos = await this.repo.obtenerDatosRelacionados(grabacion.id, grabacion.esCreador);
        return {
          ...grabacion,
          transcripciones: datos.transcripciones,
          analisis_comportamiento: datos.analisis_comportamiento,
          resumenes_ai: datos.resumenes_ai,
        };
      }),
    );
  }

  /**
   * Get user's cargo and role in a workspace.
   * Retrieves user's position and role information from miembros_espacio.
   * Useful for permission checks and UI personalization.
   *
   * @param userId - User ID
   * @param espacioId - Workspace ID
   * @returns User's cargo and rol (nulls if membership not found)
   * @throws Error if query fails
   */
  async obtenerCargoYRol(userId: string, espacioId: string): Promise<CargoYRolUsuario> {
    return this.repo.obtenerCargoYRol(userId, espacioId);
  }
}
