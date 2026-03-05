/**
 * @module hooks/space3d/useEspacioObjetos
 * Hook para gestión de objetos 3D persistentes en el espacio virtual.
 * Maneja: fetch, claim (reclamar escritorio), mover, liberar y spawn personal.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Tipos para objetos 3D persistentes
export interface EspacioObjeto {
  id: string;
  espacio_id: string;
  modelo_url: string;
  tipo: string;
  nombre: string | null;
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_x: number;
  rotacion_y: number;
  rotacion_z: number;
  escala_x: number;
  escala_y: number;
  escala_z: number;
  owner_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface SpawnPersonal {
  spawn_x: number | null;
  spawn_z: number | null;
}

export interface UseEspacioObjetosReturn {
  objetos: EspacioObjeto[];
  loading: boolean;
  spawnPersonal: SpawnPersonal;
  miEscritorio: EspacioObjeto | null;
  reclamarObjeto: (objetoId: string) => Promise<boolean>;
  liberarObjeto: (objetoId: string) => Promise<boolean>;
  moverObjeto: (objetoId: string, x: number, y: number, z: number) => Promise<boolean>;
  guardarSpawnPersonal: (x: number, z: number) => Promise<boolean>;
}

export function useEspacioObjetos(
  espacioId: string | null,
  userId: string | null
): UseEspacioObjetosReturn {
  const [objetos, setObjetos] = useState<EspacioObjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [spawnPersonal, setSpawnPersonal] = useState<SpawnPersonal>({ spawn_x: null, spawn_z: null });
  const subscriptionRef = useRef<any>(null);

  // Fetch objetos del espacio
  useEffect(() => {
    if (!espacioId || !userId) {
      setObjetos([]);
      setLoading(false);
      return;
    }

    const fetchObjetos = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('espacio_objetos')
        .select('*')
        .eq('espacio_id', espacioId);

      if (!error && data) {
        setObjetos(data as EspacioObjeto[]);
      } else {
        console.error('[useEspacioObjetos] Error fetching objetos:', error);
      }
      setLoading(false);
    };

    fetchObjetos();

    // Suscripción realtime para cambios en objetos del espacio
    subscriptionRef.current = supabase
      .channel(`espacio_objetos:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'espacio_objetos',
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setObjetos((prev) => [...prev, payload.new as EspacioObjeto]);
          } else if (payload.eventType === 'UPDATE') {
            setObjetos((prev) =>
              prev.map((obj) => (obj.id === (payload.new as EspacioObjeto).id ? (payload.new as EspacioObjeto) : obj))
            );
          } else if (payload.eventType === 'DELETE') {
            setObjetos((prev) => prev.filter((obj) => obj.id !== (payload.old as any).id));
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

  // Fetch spawn personal del usuario
  useEffect(() => {
    if (!espacioId || !userId) return;

    const fetchSpawn = async () => {
      const { data } = await supabase
        .from('miembros_espacio')
        .select('spawn_x, spawn_z')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', userId)
        .maybeSingle();

      if (data) {
        setSpawnPersonal({ spawn_x: data.spawn_x, spawn_z: data.spawn_z });
      }
    };

    fetchSpawn();
  }, [espacioId, userId]);

  // Escritorio del usuario actual
  const miEscritorio = objetos.find((o) => o.owner_id === userId) || null;

  // Reclamar un objeto (escritorio libre → asignar owner_id)
  // Enforce: un solo escritorio por usuario — libera el anterior si existe
  const reclamarObjeto = useCallback(async (objetoId: string): Promise<boolean> => {
    console.log('[useEspacioObjetos] reclamarObjeto', { objetoId, userId, espacioId });
    if (!userId) { console.warn('[useEspacioObjetos] userId es null'); return false; }

    // Si ya tiene un escritorio, liberarlo primero
    const escritorioActual = objetos.find((o) => o.owner_id === userId);
    if (escritorioActual && escritorioActual.id !== objetoId) {
      console.log('[useEspacioObjetos] Liberando escritorio anterior:', escritorioActual.id);
      await supabase
        .from('espacio_objetos')
        .update({ owner_id: null })
        .eq('id', escritorioActual.id)
        .eq('owner_id', userId);
    }

    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: userId })
      .eq('id', objetoId)
      .is('owner_id', null)
      .select();

    console.log('[useEspacioObjetos] Resultado reclamar:', { data, error });

    if (error) {
      console.error('[useEspacioObjetos] Error reclamando:', error);
      return false;
    }

    if (!data || data.length === 0) {
      console.warn('[useEspacioObjetos] No se reclamó — RLS o ya ocupado');
      return false;
    }

    // Guardar spawn personal en la posición del escritorio reclamado
    const objeto = objetos.find((o) => o.id === objetoId);
    if (objeto) {
      await guardarSpawnPersonal(objeto.posicion_x, objeto.posicion_z);
    }

    return true;
  }, [userId, objetos, espacioId]);

  // Liberar un objeto (quitar owner_id)
  const liberarObjeto = useCallback(async (objetoId: string): Promise<boolean> => {
    console.log('[useEspacioObjetos] liberarObjeto', { objetoId, userId });
    if (!userId) { console.warn('[useEspacioObjetos] userId null en liberar'); return false; }

    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: null })
      .eq('id', objetoId)
      .eq('owner_id', userId)
      .select();

    console.log('[useEspacioObjetos] Resultado liberar:', { data, error });

    if (error) {
      console.error('[useEspacioObjetos] Error liberando:', error);
      return false;
    }

    // Limpiar spawn personal
    if (espacioId) {
      await supabase
        .from('miembros_espacio')
        .update({ spawn_x: null, spawn_z: null })
        .eq('espacio_id', espacioId)
        .eq('usuario_id', userId);
    }

    setSpawnPersonal({ spawn_x: null, spawn_z: null });
    return true;
  }, [userId, espacioId]);

  // Mover un objeto (actualizar posición)
  const moverObjeto = useCallback(async (objetoId: string, x: number, y: number, z: number): Promise<boolean> => {
    const { error } = await supabase
      .from('espacio_objetos')
      .update({ posicion_x: x, posicion_y: y, posicion_z: z })
      .eq('id', objetoId);

    if (error) {
      console.error('[useEspacioObjetos] Error moviendo objeto:', error);
      return false;
    }
    return true;
  }, []);

  // Guardar spawn personal
  const guardarSpawnPersonal = useCallback(async (x: number, z: number): Promise<boolean> => {
    if (!espacioId || !userId) return false;

    const { error } = await supabase
      .from('miembros_espacio')
      .update({ spawn_x: x, spawn_z: z })
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId);

    if (error) {
      console.error('[useEspacioObjetos] Error guardando spawn:', error);
      return false;
    }

    setSpawnPersonal({ spawn_x: x, spawn_z: z });
    return true;
  }, [espacioId, userId]);

  return {
    objetos,
    loading,
    spawnPersonal,
    miEscritorio,
    reclamarObjeto,
    liberarObjeto,
    moverObjeto,
    guardarSpawnPersonal,
  };
}
