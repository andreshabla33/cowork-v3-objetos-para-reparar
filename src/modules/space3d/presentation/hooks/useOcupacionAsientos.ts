import { useCallback, useEffect, useMemo, useState } from 'react';
import { ocupacionAsientosRepository } from '@/core/infrastructure/adapters/OcupacionAsientosSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';
import type { OcupacionAsientoReal } from '@/core/domain/ports/IOcupacionAsientosRepository';

const log = logger.child('useOcupacionAsientos');

export type { OcupacionAsientoReal };

interface ResultadoOcupacionAsiento {
  ok: boolean;
  motivo?: 'asiento_ocupado' | 'sin_sesion' | 'error';
  ocupacion?: OcupacionAsientoReal;
}

export interface UseOcupacionAsientosReturn {
  ocupaciones: OcupacionAsientoReal[];
  loading: boolean;
  miOcupacion: OcupacionAsientoReal | null;
  ocupacionesPorObjetoId: Map<string, OcupacionAsientoReal>;
  ocuparAsiento: (espacioObjetoId: string, claveAsiento?: string) => Promise<ResultadoOcupacionAsiento>;
  liberarAsiento: (espacioObjetoId?: string | null, claveAsiento?: string | null) => Promise<boolean>;
  refrescarOcupacion: (espacioObjetoId?: string | null, claveAsiento?: string | null) => Promise<boolean>;
}

const LATIDO_VIGENTE_MS = 60_000;

const esOcupacionVigente = (ocupacion: OcupacionAsientoReal, ahora: number) => {
  const ultimoLatido = new Date(ocupacion.ultimo_latido_en).getTime();
  return Number.isFinite(ultimoLatido) && ahora - ultimoLatido <= LATIDO_VIGENTE_MS;
};

export function useOcupacionAsientos(
  espacioId: string | null,
  userId: string | null
): UseOcupacionAsientosReturn {
  const [ocupacionesRaw, setOcupacionesRaw] = useState<OcupacionAsientoReal[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcaTiempo, setMarcaTiempo] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setMarcaTiempo(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const normalizarOcupaciones = useCallback((filas: OcupacionAsientoReal[]) => {
    const ahora = Date.now();
    return filas.filter((fila) => esOcupacionVigente(fila, ahora));
  }, []);

  useEffect(() => {
    if (!espacioId || !userId) {
      setOcupacionesRaw([]);
      setLoading(false);
      return;
    }

    const cargarOcupaciones = async () => {
      setLoading(true);
      try {
        const data = await ocupacionAsientosRepository.listarPorEspacio(espacioId);
        setOcupacionesRaw(data);
      } catch (err) {
        log.error('Error fetching ocupaciones', { error: err instanceof Error ? err.message : String(err) });
      }
      setLoading(false);
    };

    cargarOcupaciones();

    return ocupacionAsientosRepository.suscribirCambios(espacioId, (evento) => {
      if (evento.tipo === 'INSERT') {
        setOcupacionesRaw((prev) => [...prev.filter((fila) => fila.id !== evento.ocupacion.id), evento.ocupacion]);
      } else if (evento.tipo === 'UPDATE') {
        setOcupacionesRaw((prev) => prev.map((fila) => fila.id === evento.ocupacion.id ? evento.ocupacion : fila));
      } else if (evento.tipo === 'DELETE') {
        setOcupacionesRaw((prev) => prev.filter((fila) => fila.id !== evento.ocupacion.id));
      }
    });
  }, [espacioId, userId]);

  const ocupaciones = useMemo(() => {
    return normalizarOcupaciones(ocupacionesRaw);
  }, [marcaTiempo, normalizarOcupaciones, ocupacionesRaw]);

  const ocupacionesPorObjetoId = useMemo(() => {
    return new Map(ocupaciones.map((ocupacion) => [ocupacion.espacio_objeto_id, ocupacion]));
  }, [ocupaciones]);

  const miOcupacion = useMemo(() => {
    if (!userId) return null;
    return ocupaciones.find((ocupacion) => ocupacion.usuario_id === userId) || null;
  }, [ocupaciones, userId]);

  const ocuparAsiento = useCallback(async (espacioObjetoId: string, claveAsiento = 'principal'): Promise<ResultadoOcupacionAsiento> => {
    if (!espacioId || !userId) {
      return { ok: false, motivo: 'sin_sesion' };
    }
    try {
      const ocupacion = await ocupacionAsientosRepository.ocupar(espacioId, espacioObjetoId, claveAsiento);
      return { ok: true, ocupacion };
    } catch (error: unknown) {
      const err = error as { message?: string; details?: string };
      const mensaje = `${err.message || ''} ${err.details || ''}`.toUpperCase();
      if (mensaje.includes('ASIENTO_OCUPADO')) {
        return { ok: false, motivo: 'asiento_ocupado' };
      }
      log.error('Error ocupando asiento', { error: err.message || String(error) });
      return { ok: false, motivo: 'error' };
    }
  }, [espacioId, userId]);

  const liberarAsiento = useCallback(async (espacioObjetoId?: string | null, claveAsiento?: string | null) => {
    if (!userId) return false;
    return ocupacionAsientosRepository.liberar(espacioObjetoId ?? null, claveAsiento ?? null);
  }, [userId]);

  const refrescarOcupacion = useCallback(async (espacioObjetoId?: string | null, claveAsiento?: string | null) => {
    if (!userId) return false;
    return ocupacionAsientosRepository.refrescar(espacioObjetoId ?? null, claveAsiento ?? null);
  }, [userId]);

  return {
    ocupaciones,
    loading,
    miOcupacion,
    ocupacionesPorObjetoId,
    ocuparAsiento,
    liberarAsiento,
    refrescarOcupacion,
  };
}
