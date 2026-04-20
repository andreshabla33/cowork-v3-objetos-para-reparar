/**
 * @module hooks/space3d/useConfiguracionPerimetro
 *
 * Clean Architecture — Presentation hook que consume los use cases.
 * NO conoce Supabase ni tablas; solo habla con Application via use cases.
 *
 * Responsabilidades:
 *  1. Cargar policy inicial al montar (useEffect + use case).
 *  2. Subscribir a cambios realtime para reflejar updates del admin en vivo.
 *  3. Exponer mutador `actualizar()` para el panel admin.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SCENE_POLICY,
  type PerimeterPolicy,
} from '@/src/core/domain/entities/espacio3d/ScenePolicy';
import {
  ObtenerConfiguracionPerimetroUseCase,
  ActualizarConfiguracionPerimetroUseCase,
  SuscribirConfiguracionPerimetroUseCase,
} from '@/src/core/application/usecases/ConfiguracionPerimetroUseCases';
import { ConfiguracionPerimetroSupabaseRepository } from '@/src/core/infrastructure/adapters/ConfiguracionPerimetroSupabaseRepository';
import { logger } from '@/lib/logger';

const log = logger.child('useConfiguracionPerimetro');

// ─── DI singleton ────────────────────────────────────────────────────────────
// El repositorio es stateless — singleton module-level evita re-instanciar
// el channel de realtime en cada mount de componente que use el hook.

const repo = new ConfiguracionPerimetroSupabaseRepository();
const obtenerUC = new ObtenerConfiguracionPerimetroUseCase(repo);
const actualizarUC = new ActualizarConfiguracionPerimetroUseCase(repo);
const suscribirUC = new SuscribirConfiguracionPerimetroUseCase(repo);

const FALLBACK_POLICY: PerimeterPolicy = DEFAULT_SCENE_POLICY.perimeter!;

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseConfiguracionPerimetroReturn {
  policy: PerimeterPolicy;
  loading: boolean;
  error: string | null;
  actualizar: (policy: PerimeterPolicy) => Promise<void>;
}

/**
 * Consume la config del perímetro del espacio. Actualiza en vivo cuando
 * el admin la modifica desde el panel (Supabase Realtime).
 *
 * Si `espacioId` es null/undefined, retorna el fallback sin tocar red.
 */
export function useConfiguracionPerimetro(
  espacioId: string | null | undefined,
): UseConfiguracionPerimetroReturn {
  const [policy, setPolicy] = useState<PerimeterPolicy>(FALLBACK_POLICY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Carga inicial + realtime subscription atados al ciclo de vida del espacioId.
  useEffect(() => {
    if (!espacioId) {
      setPolicy(FALLBACK_POLICY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let unsubscribe: (() => void) | null = null;

    obtenerUC
      .ejecutar(espacioId)
      .then((resolved) => {
        if (!mountedRef.current) return;
        setPolicy(resolved);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Initial load failed', { espacioId, error: msg });
        setError(msg);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    // Realtime: cualquier UPDATE de otro cliente se propaga instantáneamente.
    unsubscribe = suscribirUC.ejecutar(espacioId, (nueva) => {
      if (!mountedRef.current) return;
      setPolicy(nueva);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [espacioId]);

  const actualizar = useCallback(
    async (nueva: PerimeterPolicy) => {
      if (!espacioId) {
        log.warn('actualizar llamado sin espacioId');
        return;
      }
      try {
        await actualizarUC.ejecutar(espacioId, nueva);
        // Optimistic update: reflejamos localmente antes del eco realtime.
        if (mountedRef.current) setPolicy(nueva);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Update failed', { espacioId, error: msg });
        if (mountedRef.current) setError(msg);
        throw err;
      }
    },
    [espacioId],
  );

  return { policy, loading, error, actualizar };
}
