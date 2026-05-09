/**
 * @module infrastructure/adapters/CargoSupabaseRepository
 * @description Supabase implementation of ICargoRepository.
 * Encapsulates all `cargos` table queries.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 *
 * Ref: Supabase JS v2 — PostgREST select/insert/update/delete.
 */

import { supabase } from '@/lib/supabase';
import type {
  Cargo,
  CargoCreateInput,
  CargoUpdateInput,
  ICargoRepository,
} from '../../domain/ports/ICargoRepository';

export class CargoSupabaseRepository implements ICargoRepository {
  async listByWorkspace(workspaceId: string): Promise<Cargo[]> {
    const { data, error } = await supabase
      .from('cargos')
      .select('*')
      .eq('espacio_id', workspaceId)
      .order('orden');
    if (error) throw error;
    return (data ?? []) as Cargo[];
  }

  async create(workspaceId: string, input: CargoCreateInput): Promise<void> {
    const { error } = await supabase
      .from('cargos')
      .insert({
        espacio_id: workspaceId,
        nombre: input.nombre,
        descripcion: input.descripcion,
        categoria: input.categoria,
        icono: input.icono,
        orden: input.orden,
        solo_admin: input.solo_admin,
        tiene_analisis_avanzado: input.tiene_analisis_avanzado,
      });
    if (error) throw error;
  }

  async update(id: string, input: CargoUpdateInput): Promise<void> {
    const { error } = await supabase
      .from('cargos')
      .update({
        nombre: input.nombre,
        descripcion: input.descripcion,
        categoria: input.categoria,
        icono: input.icono,
        solo_admin: input.solo_admin,
        tiene_analisis_avanzado: input.tiene_analisis_avanzado,
      })
      .eq('id', id);
    if (error) throw error;
  }

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase
      .from('cargos')
      .update({ activo })
      .eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cargos').delete().eq('id', id);
    if (error) throw error;
  }
}

export const cargoRepository = new CargoSupabaseRepository();
