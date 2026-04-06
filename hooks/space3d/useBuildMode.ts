/**
 * @module hooks/space3d/useBuildMode
 * @description Hook for BuildModePanel UI component.
 * Manages 3D catalog loading and state.
 * Replaces all direct Supabase access in BuildModePanel.tsx.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access — all data flows through repository ports.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 */

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import type { CatalogoObjeto3D } from '@/src/core/domain/ports/ISpaceRepository';

// Adapter (singleton instance)
import { spaceRepository } from '@/src/core/infrastructure/adapters/SpaceSupabaseRepository';

// Use case
import { CargarCatalogo3DUseCase } from '@/src/core/application/usecases/CargarCatalogo3DUseCase';

const log = logger.child('use-build-mode');

// Singleton use case instance
const cargarCatalogo = new CargarCatalogo3DUseCase(spaceRepository);

/**
 * Return type for useBuildMode hook.
 */
export interface UseBuildModeReturn {
  availableObjects: CatalogoObjeto3D[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage 3D object catalog for build mode.
 *
 * @returns Hook state with catalog, loading, and error status.
 *
 * @example
 * const { availableObjects, loading } = useBuildMode();
 */
export function useBuildMode(): UseBuildModeReturn {
  const [availableObjects, setAvailableObjects] = useState<CatalogoObjeto3D[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      setError(null);
      try {
        const catalog = await cargarCatalogo.execute();
        setAvailableObjects(catalog);
        log.debug('Catalog fetched', { count: catalog.length });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to fetch catalog', { error: message });
        setError(message);
        setAvailableObjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, []);

  return {
    availableObjects,
    loading,
    error,
  };
}
