/**
 * @module infrastructure/adapters/OcupacionAsientosSupabaseRepository
 * @description Supabase adapter para IOcupacionAsientosRepository.
 *
 * Tabla: `ocupacion_asientos`.
 * RPCs: `ocupar_asiento_espacio`, `liberar_asiento_espacio`, `refrescar_ocupacion_asiento`.
 * Realtime: postgres_changes filtered by espacio_id.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  IOcupacionAsientosRepository,
  OcupacionAsientoReal,
  EventoOcupacionAsiento,
} from '@/core/domain/ports/IOcupacionAsientosRepository';

const log = logger.child('ocupacion-asientos-repository');

export class OcupacionAsientosSupabaseRepository implements IOcupacionAsientosRepository {
  async listarPorEspacio(espacioId: string): Promise<OcupacionAsientoReal[]> {
    const { data, error } = await supabase
      .from('ocupacion_asientos')
      .select('*')
      .eq('espacio_id', espacioId);
    if (error) {
      log.error('Error fetching ocupaciones', { error: error.message, espacioId });
      throw error;
    }
    return (data ?? []) as OcupacionAsientoReal[];
  }

  suscribirCambios(espacioId: string, callback: (evento: EventoOcupacionAsiento) => void): () => void {
    const channel = supabase
      .channel(`ocupacion_asientos:${espacioId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ocupacion_asientos',
        filter: `espacio_id=eq.${espacioId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          callback({ tipo: 'INSERT', ocupacion: payload.new as OcupacionAsientoReal });
        } else if (payload.eventType === 'UPDATE') {
          callback({ tipo: 'UPDATE', ocupacion: payload.new as OcupacionAsientoReal });
        } else if (payload.eventType === 'DELETE') {
          callback({ tipo: 'DELETE', ocupacion: payload.old as OcupacionAsientoReal });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async ocupar(espacioId: string, espacioObjetoId: string, claveAsiento: string): Promise<OcupacionAsientoReal> {
    const { data, error } = await supabase.rpc('ocupar_asiento_espacio', {
      p_espacio_id: espacioId,
      p_espacio_objeto_id: espacioObjetoId,
      p_clave_asiento: claveAsiento,
    });
    if (error) throw error;
    return data as OcupacionAsientoReal;
  }

  async liberar(espacioObjetoId: string | null, claveAsiento: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('liberar_asiento_espacio', {
      p_espacio_objeto_id: espacioObjetoId,
      p_clave_asiento: claveAsiento,
    });
    if (error) {
      log.error('Error liberando asiento', { error: error.message });
      return false;
    }
    return !!data;
  }

  async refrescar(espacioObjetoId: string | null, claveAsiento: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('refrescar_ocupacion_asiento', {
      p_espacio_objeto_id: espacioObjetoId,
      p_clave_asiento: claveAsiento,
    });
    if (error) {
      log.error('Error refrescando ocupación', { error: error.message });
      return false;
    }
    return !!data;
  }
}

export const ocupacionAsientosRepository = new OcupacionAsientosSupabaseRepository();
