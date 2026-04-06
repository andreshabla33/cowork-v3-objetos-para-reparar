/**
 * @module application/usecases/CargarCatalogo3DUseCase
 * @description Use case for loading the 3D object catalog in build mode.
 * Orchestrates fetching from repository and handles business logic.
 *
 * Clean Architecture: Application layer — orchestrates domain and infrastructure.
 * Ref: Use Case pattern — single responsibility, reusable across components.
 */

import { logger } from '@/lib/logger';
import type { ISpaceRepository, CatalogoObjeto3D } from '../../domain/ports/ISpaceRepository';

const log = logger.child('cargar-catalogo-3d');

/**
 * Load 3D object catalog from Supabase.
 * Cached in component state; called on mount.
 */
export class CargarCatalogo3DUseCase {
  constructor(private spaceRepository: ISpaceRepository) {}

  /**
   * Execute: fetch catalog.
   * Returns empty array on failure (repo handles logging).
   */
  async execute(): Promise<CatalogoObjeto3D[]> {
    try {
      const catalogo = await this.spaceRepository.obtenerCatalogo3D();
      log.info('Catalog loaded', { count: catalogo.length });
      return catalogo;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load catalog', { error: message });
      return [];
    }
  }
}
