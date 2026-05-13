/**
 * @module space3d/hooks/useAreasEscritorio
 *
 * Hook DI que provee el estado realtime de `AreaEscritorio` para un espacio
 * + acciones (reclamar, liberar, designar admin, asignar admin). Inyecta el
 * adapter Supabase via `areaEscritorioRepository` y compone los use cases
 * del Application.
 *
 * Clean Architecture — Presentation. NO contiene reglas de negocio
 * (delegadas al Domain via los use cases). Solo coordina el lifecycle React.
 *
 * Refs:
 *  - https://supabase.com/docs/guides/realtime/postgres-changes
 *  - https://react.dev/reference/react/useEffect (subscribe/unsubscribe pattern)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { areaEscritorioRepository } from '@/core/infrastructure/adapters/AreaEscritorioSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';
import { ReclamarAreaEscritorioUseCase } from '@/src/core/application/usecases/ReclamarAreaEscritorioUseCase';
import { LiberarAreaEscritorioUseCase } from '@/src/core/application/usecases/LiberarAreaEscritorioUseCase';
import { DesignarAreaEscritorioUseCase } from '@/src/core/application/usecases/DesignarAreaEscritorioUseCase';
import { AsignarAreaEscritorioUseCase } from '@/src/core/application/usecases/AsignarAreaEscritorioUseCase';
import type {
  AreaEscritorio,
  BboxAreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type { ResultadoMutacionAreaEscritorio } from '@/src/core/domain/ports/IAreaEscritorioRepository';

const log = logger.child('use-areas-escritorio');

export interface UseAreasEscritorioReturn {
  /** Lista canónica de áreas del espacio (realtime). */
  areas: AreaEscritorio[];
  /** El área que el usuario actual tiene reclamada, si alguna. */
  miArea: AreaEscritorio | null;
  loading: boolean;
  /** Miembro: reclamar un área. */
  reclamar: (area: AreaEscritorio) => Promise<ResultadoMutacionAreaEscritorio>;
  /** Miembro: liberar mi área. */
  liberar: (area: AreaEscritorio) => Promise<ResultadoMutacionAreaEscritorio>;
  /** Admin: crear un área nueva (drag rectangle → bbox). */
  designar: (input: {
    bbox: BboxAreaEscritorio;
    nombre: string;
    audioAislado?: boolean;
  }) => Promise<ResultadoMutacionAreaEscritorio>;
  /** Admin: pre-asignar (o quitar pre-asignación). */
  asignar: (areaId: string, usuarioId: string | null, forzarReasignacion?: boolean) => Promise<ResultadoMutacionAreaEscritorio>;
}

export function useAreasEscritorio(
  espacioId: string | null,
  usuarioId: string | null,
): UseAreasEscritorioReturn {
  const [areas, setAreas] = useState<AreaEscritorio[]>([]);
  const [loading, setLoading] = useState(true);

  // Use cases instanciados una sola vez (el repo es singleton module-level).
  const reclamarUC = useMemo(() => new ReclamarAreaEscritorioUseCase(areaEscritorioRepository), []);
  const liberarUC = useMemo(() => new LiberarAreaEscritorioUseCase(areaEscritorioRepository), []);
  const designarUC = useMemo(() => new DesignarAreaEscritorioUseCase(areaEscritorioRepository), []);
  const asignarUC = useMemo(() => new AsignarAreaEscritorioUseCase(areaEscritorioRepository), []);

  // ─── Realtime sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!espacioId) {
      setAreas([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cargar = async () => {
      setLoading(true);
      try {
        const data = await areaEscritorioRepository.listarPorEspacio(espacioId);
        if (!cancelled) setAreas(data);
      } catch (err) {
        log.error('Error cargando areas_escritorio', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    cargar();

    const unsub = areaEscritorioRepository.suscribirCambios(espacioId, (evento) => {
      setAreas((prev) => {
        if (evento.tipo === 'INSERT') {
          // Idempotente: si ya está (race entre fetch inicial y first event), reemplaza.
          const sin = prev.filter((a) => a.id !== evento.area.id);
          return [...sin, evento.area];
        }
        if (evento.tipo === 'UPDATE') {
          return prev.map((a) => (a.id === evento.area.id ? evento.area : a));
        }
        // DELETE
        return prev.filter((a) => a.id !== evento.area.id);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [espacioId]);

  // ─── Derived ──────────────────────────────────────────────────────────
  const miArea = useMemo(() => {
    if (!usuarioId) return null;
    return areas.find((a) => a.reclamado_por_usuario_id === usuarioId) ?? null;
  }, [areas, usuarioId]);

  // ─── Actions ──────────────────────────────────────────────────────────
  const reclamar = useCallback(async (area: AreaEscritorio) => {
    if (!usuarioId) return { ok: false as const, motivo: 'no_autorizado' as const };
    return reclamarUC.execute({ area, usuarioId });
  }, [reclamarUC, usuarioId]);

  const liberar = useCallback(async (area: AreaEscritorio) => {
    if (!usuarioId) return { ok: false as const, motivo: 'no_autorizado' as const };
    return liberarUC.execute({ area, usuarioId });
  }, [liberarUC, usuarioId]);

  const designar = useCallback(async (input: {
    bbox: BboxAreaEscritorio;
    nombre: string;
    audioAislado?: boolean;
  }) => {
    if (!espacioId) return { ok: false as const, motivo: 'no_autorizado' as const };
    return designarUC.execute({
      espacioId,
      bbox: input.bbox,
      nombre: input.nombre,
      audioAislado: input.audioAislado,
    });
  }, [designarUC, espacioId]);

  const asignar = useCallback(async (areaId: string, usuario: string | null, forzar = false) => {
    return asignarUC.execute({
      areaId,
      usuarioId: usuario,
      forzarReasignacion: forzar,
    });
  }, [asignarUC]);

  return { areas, miArea, loading, reclamar, liberar, designar, asignar };
}
