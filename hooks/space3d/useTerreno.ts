/**
 * @module hooks/space3d/useTerreno
 *
 * Clean Architecture — Presentation hook que consume `CargarTerrenoUseCase`.
 * Devuelve el terreno del espacio o `TERRENO_FLAT_DEFAULT` si no existe.
 *
 * Coste: 1 fetch al mount + memoizado en estado React. Sin realtime por ahora
 * (el terreno cambia raramente; refetch manual via `recargar()` si hace falta).
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md (apoyo de Fase 2 — alimenta `Terrain3D`).
 */

import { useCallback, useEffect, useState } from 'react';
import { CargarTerrenoUseCase } from '@/src/core/application/usecases/CargarTerrenoUseCase';
import {
  TERRENO_FLAT_DEFAULT,
  type TerrenoEntity,
} from '@/src/core/domain/entities/espacio3d/TerrenoEntity';
import { useDI } from '@/src/core/infrastructure/di/DIProvider';
import { logger } from '@/lib/logger';

const log = logger.child('useTerreno');

export interface UseTerrenoReturn {
  terreno: TerrenoEntity;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

const FALLBACK = (espacioId: string): TerrenoEntity => ({
  id: '',
  espacioId,
  ...TERRENO_FLAT_DEFAULT,
});

export function useTerreno(espacioId: string | null | undefined): UseTerrenoReturn {
  const container = useDI();
  const [terreno, setTerreno] = useState<TerrenoEntity>(() =>
    espacioId ? FALLBACK(espacioId) : FALLBACK(''),
  );
  const [loading, setLoading] = useState<boolean>(!!espacioId);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!espacioId) {
      setTerreno(FALLBACK(''));
      setLoading(false);
      setError(null);
      return;
    }

    let cancelado = false;
    setLoading(true);
    setError(null);

    const useCase = new CargarTerrenoUseCase(container.terreno);
    useCase
      .ejecutar({ espacioId })
      .then((result) => {
        if (cancelado) return;
        setTerreno(result);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Error cargando terreno', { espacioId, msg });
        setError(msg);
        setTerreno(FALLBACK(espacioId));
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [espacioId, container, tick]);

  return { terreno, loading, error, recargar };
}
