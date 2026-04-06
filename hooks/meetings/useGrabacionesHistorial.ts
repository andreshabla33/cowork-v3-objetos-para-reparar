/**
 * @module hooks/meetings/useGrabacionesHistorial
 * @description Custom hook for loading recording history with related data.
 * Encapsulates all Supabase operations using application use cases.
 * Implements Clean Architecture: Component layer depends on this hook,
 * hook depends on use case, use case depends on repository interface.
 *
 * @see CargarHistorialGrabacionesUseCase for orchestration logic
 * @see IRecordingRepository for data contract
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import type {
  GrabacionConDatos,
  CargoYRolUsuario,
} from '@/src/core/domain/ports/IRecordingRepository';
import { recordingRepository } from '@/src/core/infrastructure/adapters/RecordingSupabaseRepository';
import { CargarHistorialGrabacionesUseCase } from '@/src/core/application/usecases/CargarHistorialGrabacionesUseCase';

const log = logger.child('use-grabaciones-historial');

// Singleton instance of the use case
const cargarHistorial = new CargarHistorialGrabacionesUseCase(recordingRepository);

/**
 * Return type for the hook.
 * Provides recordings, loading state, error state, and user permissions.
 */
export interface UseGrabacionesHistorialReturn {
  /** Array of recordings with esCreador and esParticipante flags */
  grabaciones: GrabacionConDatos[];
  /** True while loading recordings or enriching data */
  isLoading: boolean;
  /** Error message if loading failed, null otherwise */
  error: string | null;
  /** User's job position/cargo in the workspace, null if not set */
  cargoUsuario: string | null;
  /** User's system role (admin, member, etc), null if not set */
  rolSistema: string | null;
  /** Manual refresh function to reload all recordings */
  cargarGrabaciones: () => Promise<void>;
}

/**
 * Custom hook for managing recording history.
 * Loads recordings where user is creator or participant.
 * Enriches with transcriptions, behavioral analysis, and AI summaries in background.
 *
 * @param espacioId - Workspace ID
 * @param userId - Current user ID
 * @returns Object with recordings, loading state, permissions, and refresh function
 *
 * @example
 * const { grabaciones, isLoading, error, cargarGrabaciones } = useGrabacionesHistorial(
 *   activeWorkspace?.id,
 *   session?.user?.id
 * );
 */
export function useGrabacionesHistorial(
  espacioId: string | undefined,
  userId: string | undefined,
): UseGrabacionesHistorialReturn {
  // State management
  const [grabaciones, setGrabaciones] = useState<GrabacionConDatos[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargoUsuario, setCargoUsuario] = useState<string | null>(null);
  const [rolSistema, setRolSistema] = useState<string | null>(null);

  /**
   * Load user's cargo and role from workspace membership.
   * Called before loading recordings to determine permissions.
   *
   * @throws Error if query fails
   */
  const cargarCargoYRol = useCallback(async (): Promise<void> => {
    if (!userId || !espacioId) {
      return;
    }

    try {
      log.debug('Loading user cargo and rol', { userId, espacioId });
      const result = await cargarHistorial.obtenerCargoYRol(userId, espacioId);

      setCargoUsuario(result.cargo);
      setRolSistema(result.rol);

      log.debug('User cargo and rol loaded', { cargo: result.cargo, rol: result.rol });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Failed to load user cargo and rol', { error: errorMsg });
      // Non-fatal: continue loading recordings even if cargo/rol fails
    }
  }, [userId, espacioId]);

  /**
   * Load all recordings and enrich with related data.
   * Two-phase loading:
   * 1. Load basic recordings immediately for fast UI display
   * 2. Enrich with transcriptions/analysis in background with safety timeout
   *
   * @throws Error if loading fails
   */
  const cargarGrabaciones = useCallback(async (): Promise<void> => {
    if (!espacioId || !userId) {
      log.warn('Cannot load recordings: missing espacioId or userId', { espacioId, userId });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      log.info('Loading recordings', { espacioId, userId });

      // Phase 1: Load basic recordings (creator + participant)
      const grabacionesBasicas = await cargarHistorial.execute(espacioId, userId);
      log.debug('Basic recordings loaded', { count: grabacionesBasicas.length });

      // Set basic recordings immediately for fast display
      setGrabaciones(grabacionesBasicas);
      setIsLoading(false);

      // Phase 2: Enrich with related data in background (non-blocking)
      if (grabacionesBasicas.length > 0) {
        try {
          // Create a timeout promise to prevent indefinite waiting
          const enrichmentPromise = cargarHistorial.enriquecerConDatos(grabacionesBasicas);
          const timeoutPromise = new Promise<GrabacionConDatos[]>((_, reject) => {
            setTimeout(
              () => reject(new Error('Enrichment timeout after 10s')),
              10000,
            );
          });

          const grabacionesEnriquecidas = await Promise.race([
            enrichmentPromise,
            timeoutPromise,
          ]);

          log.debug('Recordings enriched with related data', {
            count: grabacionesEnriquecidas.length,
          });
          setGrabaciones(grabacionesEnriquecidas);
        } catch (enrichError) {
          const enrichErrorMsg = enrichError instanceof Error
            ? enrichError.message
            : 'Error desconocido';
          log.warn('Background enrichment failed, continuing with basic data', {
            error: enrichErrorMsg,
          });
          // Non-fatal: keep displaying basic recordings even if enrichment fails
        }
      }
    } catch (err) {
      // Type-safe error handling
      let errorMessage = 'Error al cargar las grabaciones';

      if (err instanceof Error) {
        errorMessage = `Error al cargar las grabaciones: ${err.message}`;
        log.error('Failed to load recordings', { error: err.message, stack: err.stack });
      } else {
        log.error('Failed to load recordings with unknown error', { error: err });
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [espacioId, userId]);

  /**
   * Initialize: Load cargo/rol and recordings on mount or when dependencies change.
   * Includes safety timeout to prevent UI freeze.
   */
  useEffect(() => {
    if (!espacioId || !userId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const initialize = async (): Promise<void> => {
      // Load permissions first
      await cargarCargoYRol();

      // Then load recordings
      await cargarGrabaciones();

      // Ensure isLoading is false even if promises hang
      if (isMounted) {
        safetyTimer = setTimeout(() => {
          if (isMounted) {
            log.warn('Safety timeout reached, forcing isLoading=false');
            setIsLoading(false);
          }
        }, 10000);
      }
    };

    initialize();

    // Cleanup
    return (): void => {
      isMounted = false;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
      }
    };
  }, [espacioId, userId, cargarCargoYRol, cargarGrabaciones]);

  return {
    grabaciones,
    isLoading,
    error,
    cargoUsuario,
    rolSistema,
    cargarGrabaciones,
  };
}
