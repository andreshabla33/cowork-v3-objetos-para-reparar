/**
 * @module infrastructure/adapters/EmpresaSupabaseRepository
 * @description Adapter Supabase para `IEmpresaRepository`.
 *
 * Tabla: `empresas`. Lectura pública gobernada por RLS del lado servidor.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { EmpresaBasica, IEmpresaRepository } from '@/core/domain/ports/IEmpresaRepository';

const log = logger.child('empresa-repository');

class EmpresaSupabaseRepository implements IEmpresaRepository {
  async cargarEmpresasDeEspacio(espacioId: string): Promise<EmpresaBasica[]> {
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nombre, logo_url')
      .eq('espacio_id', espacioId)
      .order('nombre');

    if (error) {
      log.error('Error cargando empresas del espacio', { espacioId, error: error.message });
      throw error;
    }

    return (data ?? []) as EmpresaBasica[];
  }
}

export const empresaRepository: IEmpresaRepository = new EmpresaSupabaseRepository();
