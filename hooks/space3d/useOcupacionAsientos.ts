import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface OcupacionAsientoReal {
  id: string;
  espacio_id: string;
  espacio_objeto_id: string;
  clave_asiento: string;
  usuario_id: string;
  ocupado_en: string;
  ultimo_latido_en: string;
  actualizado_en: string;
}

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
  const subscriptionRef = useRef<any>(null);

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
      const { data, error } = await supabase
        .from('ocupacion_asientos')
        .select('*')
        .eq('espacio_id', espacioId);

      if (error) {
        console.error('[useOcupacionAsientos] Error fetching ocupaciones:', error);
      } else {
        setOcupacionesRaw((data as OcupacionAsientoReal[]) || []);
      }
      setLoading(false);
    };

    cargarOcupaciones();

    subscriptionRef.current = supabase
      .channel(`ocupacion_asientos:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ocupacion_asientos',
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOcupacionesRaw((prev) => [...prev.filter((fila) => fila.id !== (payload.new as OcupacionAsientoReal).id), payload.new as OcupacionAsientoReal]);
          } else if (payload.eventType === 'UPDATE') {
            setOcupacionesRaw((prev) => prev.map((fila) => fila.id === (payload.new as OcupacionAsientoReal).id ? (payload.new as OcupacionAsientoReal) : fila));
          } else if (payload.eventType === 'DELETE') {
            setOcupacionesRaw((prev) => prev.filter((fila) => fila.id !== (payload.old as OcupacionAsientoReal).id));
          }
        }
      )
      .subscribe();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
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

    const { data, error } = await supabase.rpc('ocupar_asiento_espacio', {
      p_espacio_id: espacioId,
      p_espacio_objeto_id: espacioObjetoId,
      p_clave_asiento: claveAsiento,
    });

    if (error) {
      const mensaje = `${error.message || ''} ${error.details || ''}`.toUpperCase();
      if (mensaje.includes('ASIENTO_OCUPADO')) {
        return { ok: false, motivo: 'asiento_ocupado' };
      }
      console.error('[useOcupacionAsientos] Error ocupando asiento:', error);
      return { ok: false, motivo: 'error' };
    }

    return { ok: true, ocupacion: data as OcupacionAsientoReal };
  }, [espacioId, userId]);

  const liberarAsiento = useCallback(async (espacioObjetoId?: string | null, claveAsiento?: string | null) => {
    if (!userId) return false;

    const { data, error } = await supabase.rpc('liberar_asiento_espacio', {
      p_espacio_objeto_id: espacioObjetoId ?? null,
      p_clave_asiento: claveAsiento ?? null,
    });

    if (error) {
      console.error('[useOcupacionAsientos] Error liberando asiento:', error);
      return false;
    }

    return !!data;
  }, [userId]);

  const refrescarOcupacion = useCallback(async (espacioObjetoId?: string | null, claveAsiento?: string | null) => {
    if (!userId) return false;

    const { data, error } = await supabase.rpc('refrescar_ocupacion_asiento', {
      p_espacio_objeto_id: espacioObjetoId ?? null,
      p_clave_asiento: claveAsiento ?? null,
    });

    if (error) {
      console.error('[useOcupacionAsientos] Error refrescando ocupación:', error);
      return false;
    }

    return !!data;
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
