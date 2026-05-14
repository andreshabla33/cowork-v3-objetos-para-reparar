/**
 * @module space3d/hooks/usePisosDecorativos
 *
 * Hook DI que provee el estado realtime de pisos decorativos (alfombras /
 * parches de material) para un espacio + acciones (crear, eliminar).
 * Inyecta el adapter Supabase `pisoDecorativoRepository` y compone los
 * use cases del Application.
 *
 * Clean Architecture — Presentation. La lógica de negocio (validación de
 * bbox, normalización de FloorType) vive en los use cases del Application.
 *
 * Refs:
 *  - https://supabase.com/docs/guides/realtime/postgres-changes
 *  - https://react.dev/reference/react/useEffect
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pisoDecorativoRepository } from '@/core/infrastructure/adapters/PisoDecorativoSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';
import { CrearPisoDecorativoUseCase } from '@/core/application/usecases/CrearPisoDecorativoUseCase';
import { EliminarPisoDecorativoUseCase } from '@/core/application/usecases/EliminarPisoDecorativoUseCase';
import type {
  PisoDecorativo,
  CrearPisoDecorativoInput,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';
import type { ResultadoMutacionPisoDecorativo } from '@/core/domain/ports/IPisoDecorativoRepository';

const log = logger.child('use-pisos-decorativos');

export interface UsePisosDecorativosReturn {
  pisos: PisoDecorativo[];
  loading: boolean;
  crear: (input: Omit<CrearPisoDecorativoInput, 'espacioId'>) => Promise<ResultadoMutacionPisoDecorativo>;
  eliminar: (pisoId: string) => Promise<{ ok: boolean; motivo?: string }>;
}

export function usePisosDecorativos(espacioId: string | null): UsePisosDecorativosReturn {
  const [pisos, setPisos] = useState<PisoDecorativo[]>([]);
  const [loading, setLoading] = useState(true);

  const crearUC = useMemo(() => new CrearPisoDecorativoUseCase(pisoDecorativoRepository), []);
  const eliminarUC = useMemo(() => new EliminarPisoDecorativoUseCase(pisoDecorativoRepository), []);

  useEffect(() => {
    if (!espacioId) {
      setPisos([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cargar = async () => {
      setLoading(true);
      try {
        const data = await pisoDecorativoRepository.listarPorEspacio(espacioId);
        if (!cancelled) setPisos(data);
      } catch (err) {
        log.error('Error cargando pisos decorativos', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    cargar();

    const unsub = pisoDecorativoRepository.suscribirCambios(espacioId, (evento) => {
      setPisos((prev) => {
        if (evento.tipo === 'INSERT') {
          const sin = prev.filter((p) => p.id !== evento.piso.id);
          return [...sin, evento.piso].sort((a, b) => a.orden - b.orden);
        }
        if (evento.tipo === 'UPDATE') {
          return prev.map((p) => (p.id === evento.piso.id ? evento.piso : p));
        }
        return prev.filter((p) => p.id !== evento.piso.id);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [espacioId]);

  const crear = useCallback(async (input: Omit<CrearPisoDecorativoInput, 'espacioId'>) => {
    if (!espacioId) return { ok: false as const, motivo: 'no_autorizado' as const };
    return crearUC.execute({ ...input, espacioId });
  }, [crearUC, espacioId]);

  const eliminar = useCallback(async (pisoId: string) => {
    return eliminarUC.execute(pisoId);
  }, [eliminarUC]);

  return { pisos, loading, crear, eliminar };
}
