/**
 * @module infrastructure/adapters/DepartamentoSupabaseRepository
 * @description Supabase implementation of IDepartamentoRepository.
 * Encapsulates all `departamentos` table queries.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 *
 * Ref: Supabase JS v2 — PostgREST select/insert/update/delete.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  Departamento,
  DepartamentoInput,
  IDepartamentoRepository,
} from '../../domain/ports/IDepartamentoRepository';

export class DepartamentoSupabaseRepository implements IDepartamentoRepository {
  async listByWorkspace(workspaceId: string): Promise<Departamento[]> {
    const { data, error } = await supabase
      .from('departamentos')
      .select('*')
      .eq('espacio_id', workspaceId)
      .order('nombre');
    if (error) throw error;
    return (data ?? []) as Departamento[];
  }

  async create(workspaceId: string, input: DepartamentoInput): Promise<void> {
    const { error } = await supabase
      .from('departamentos')
      .insert({
        espacio_id: workspaceId,
        nombre: input.nombre,
        descripcion: input.descripcion,
        color: input.color,
        icono: input.icono,
      });
    if (error) throw error;
  }

  async update(id: string, input: DepartamentoInput): Promise<void> {
    const { error } = await supabase
      .from('departamentos')
      .update({
        nombre: input.nombre,
        descripcion: input.descripcion,
        color: input.color,
        icono: input.icono,
      })
      .eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('departamentos').delete().eq('id', id);
    if (error) throw error;
  }
}

export const departamentoRepository = new DepartamentoSupabaseRepository();
