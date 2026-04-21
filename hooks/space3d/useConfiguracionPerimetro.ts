/**
 * @module hooks/space3d/useConfiguracionPerimetro
 *
 * Clean Architecture — Presentation hook que consume los use cases.
 * NO conoce Supabase ni tablas; solo habla con Application via use cases.
 *
 * DI: el repositorio se resuelve desde el DIContainer (React Context),
 * no desde un singleton module-level. Permite inyectar mocks en tests.
 *
 * State: usa `useSyncExternalStore` (React 18+) sobre `PerimetroPolicyStore`.
 * Esto garantiza que componentes concurrentes vean el mismo snapshot dentro
 * de la misma transición (sin tearing) y que múltiples hooks compartan UNA
 * suscripción Realtime por espacioId.
 *
 * Refs:
 *   - https://react.dev/reference/react/useSyncExternalStore
 *   - Robert C. Martin, *Clean Architecture* cap. 11 (Dependency Rule + DI).
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
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
import { PerimetroPolicyStore } from './PerimetroPolicyStore';

const log = logger.child('useConfiguracionPerimetro');

// ─── Snapshot estable cuando no hay espacioId ────────────────────────────────
// useSyncExternalStore exige getSnapshot estable: si retornáramos un objeto
// nuevo cada render, dispararía un loop infinito.

const NULL_SNAPSHOT = Object.freeze({
  policy: DEFAULT_PERIMETER_POLICY,
  loading: false,
  error: null,
});
const noopSubscribe = () => () => {};
const getNullSnapshot = () => NULL_SNAPSHOT;

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

  // El store se construye una vez por (espacioId, container) y mantiene
  // identidad estable mientras esos no cambien.
  const store = useMemo(() => {
    if (!espacioId) return null;
    const repo = container.configuracionPerimetro;
    return new PerimetroPolicyStore(
      espacioId,
      new ObtenerConfiguracionPerimetroUseCase(repo),
      new ActualizarConfiguracionPerimetroUseCase(repo),
      new SuscribirConfiguracionPerimetroUseCase(repo),
    );
  }, [espacioId, container]);

  const snapshot = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : getNullSnapshot,
    store ? store.getServerSnapshot : getNullSnapshot,
  );

  // Mantenemos una referencia al store actual para que el callback estable
  // de `actualizar` lo lea siempre fresco sin re-crearse en cada cambio.
  const storeRef = useRef(store);
  storeRef.current = store;

  const actualizar = useCallback(
    async (nueva: PerimeterPolicy): Promise<Result<PerimeterPolicy, PerimeterPolicyError>> => {
      const s = storeRef.current;
      if (!s) {
        log.warn('actualizar llamado sin espacioId');
        return { ok: false, error: { code: 'INVALID_STYLE', received: null } };
      }
      return s.actualizar(nueva);
    },
    [],
  );

  return {
    policy: snapshot.policy,
    loading: snapshot.loading,
    error: snapshot.error,
    actualizar,
  };
}
