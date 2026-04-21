/**
 * @module hooks/space3d/useConfiguracionPerimetro
 *
 * Clean Architecture — Presentation hook que consume los use cases.
 * NO conoce Supabase ni tablas; solo habla con Application via use cases.
 *
 * DI: el repositorio se resuelve desde el DIContainer (React Context),
 * no desde un singleton module-level. Esto permite:
 *   - Inyectar mocks en tests sin tocar el módulo (containerOverride en DIProvider).
 *   - Swap del adapter por uno alternativo (ej. Storybook con datos in-memory).
 *   - Trazabilidad explícita de la dependency direction en el árbol React.
 *
 * Ref: Robert C. Martin, *Clean Architecture* cap. 11 — "DI is the only way
 * to honor the Dependency Rule when frameworks are involved."
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PERIMETER_POLICY,
  type PerimeterPolicy,
  type PerimeterPolicyError,
  type Result,
} from '@/src/core/domain/entities/espacio3d/PerimeterPolicy';
import {
  ObtenerConfiguracionPerimetroUseCase,
  ActualizarConfiguracionPerimetroUseCase,
  SuscribirConfiguracionPerimetroUseCase,
} from '@/src/core/application/usecases/ConfiguracionPerimetroUseCases';
import { useDI } from '@/src/core/infrastructure/di/DIProvider';
import { logger } from '@/lib/logger';

const log = logger.child('useConfiguracionPerimetro');

const FALLBACK_POLICY: PerimeterPolicy = DEFAULT_PERIMETER_POLICY;

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseConfiguracionPerimetroReturn {
  policy: PerimeterPolicy;
  loading: boolean;
  error: string | null;
  /**
   * Persiste la policy. Retorna Result tipado del Domain — el caller decide
   * cómo presentar el error (toast, banner, ignore). NO throw para evitar
   * que un input inválido del usuario tire el componente.
   */
  actualizar: (policy: PerimeterPolicy) => Promise<Result<PerimeterPolicy, PerimeterPolicyError>>;
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
  const container = useDI();

  // Use cases instanciados una sola vez por container — son stateless,
  // pero los memorizamos para mantener identidad de referencia estable.
  const { obtenerUC, actualizarUC, suscribirUC } = useMemo(() => {
    const repo = container.configuracionPerimetro;
    return {
      obtenerUC: new ObtenerConfiguracionPerimetroUseCase(repo),
      actualizarUC: new ActualizarConfiguracionPerimetroUseCase(repo),
      suscribirUC: new SuscribirConfiguracionPerimetroUseCase(repo),
    };
  }, [container]);

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
  }, [espacioId, obtenerUC, suscribirUC]);

  const actualizar = useCallback(
    async (nueva: PerimeterPolicy): Promise<Result<PerimeterPolicy, PerimeterPolicyError>> => {
      if (!espacioId) {
        log.warn('actualizar llamado sin espacioId');
        return { ok: false, error: { code: 'INVALID_STYLE', received: null } };
      }
      try {
        const result = await actualizarUC.ejecutar(espacioId, nueva);
        if (result.ok && mountedRef.current) {
          // Optimistic update — reflejamos localmente antes del eco realtime.
          setPolicy(result.value);
        } else if (!result.ok && mountedRef.current) {
          setError(`Validación falló: ${result.error.code}`);
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Update failed', { espacioId, error: msg });
        if (mountedRef.current) setError(msg);
        // Wrap unexpected I/O error in Result shape para coherencia.
        return { ok: false, error: { code: 'INVALID_STYLE', received: msg } };
      }
    },
    [espacioId, actualizarUC],
  );

  return { policy, loading, error, actualizar };
}
