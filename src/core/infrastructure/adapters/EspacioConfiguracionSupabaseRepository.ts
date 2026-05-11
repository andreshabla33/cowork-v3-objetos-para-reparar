/**
 * @module infrastructure/adapters/EspacioConfiguracionSupabaseRepository
 * @description Supabase adapter for IEspacioConfiguracionRepository.
 *
 * Tabla: `espacios_trabajo`, campo `configuracion` (JSONB).
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  IEspacioConfiguracionRepository,
  EspacioConfiguracion,
} from '@/core/domain/ports/IEspacioConfiguracionRepository';

export class EspacioConfiguracionSupabaseRepository implements IEspacioConfiguracionRepository {
  async obtenerConfiguracion(espacioId: string): Promise<EspacioConfiguracion | null> {
    const { data, error } = await supabase
      .from('espacios_trabajo')
      .select('configuracion')
      .eq('id', espacioId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return (data?.configuracion as EspacioConfiguracion) ?? null;
  }

  async actualizarConfiguracion(espacioId: string, configuracion: EspacioConfiguracion): Promise<void> {
    const { error } = await supabase
      .from('espacios_trabajo')
      .update({ configuracion })
      .eq('id', espacioId);
    if (error) throw error;
  }
}

export const espacioConfiguracionRepository = new EspacioConfiguracionSupabaseRepository();
