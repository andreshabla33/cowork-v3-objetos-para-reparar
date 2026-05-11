/**
 * @module infrastructure/adapters/EmpresaSupabaseRepository
 * @description Adapter Supabase para `IEmpresaRepository`.
 *
 * Tabla: `empresas`. Lectura pública gobernada por RLS del lado servidor.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  EmpresaBasica,
  EmpresaCompleta,
  EmpresaUpsertPayload,
  IEmpresaRepository,
} from '@/core/domain/ports/IEmpresaRepository';

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

  async obtenerEmpresaIdDeUsuario(espacioId: string, usuarioId: string): Promise<string | null> {
    const { data } = await supabase
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', usuarioId)
      .maybeSingle();
    return (data?.empresa_id as string | null) ?? null;
  }

  async obtenerEmpresaCompleta(empresaId: string, espacioId: string): Promise<EmpresaCompleta | null> {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .eq('espacio_id', espacioId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      log.error('Error obteniendo empresa completa', { empresaId, error: error.message });
      throw error;
    }
    return data as EmpresaCompleta;
  }

  async actualizarEmpresa(empresaId: string, payload: EmpresaUpsertPayload): Promise<void> {
    const { error } = await supabase.from('empresas').update(payload).eq('id', empresaId);
    if (error) throw error;
  }

  async crearEmpresa(
    payload: EmpresaUpsertPayload,
    espacioId: string,
    creadorId: string,
  ): Promise<EmpresaCompleta> {
    const { data, error } = await supabase
      .from('empresas')
      .insert({ ...payload, creado_por: creadorId, espacio_id: espacioId })
      .select()
      .single();
    if (error) throw error;
    return data as EmpresaCompleta;
  }
}

export const empresaRepository: IEmpresaRepository = new EmpresaSupabaseRepository();
