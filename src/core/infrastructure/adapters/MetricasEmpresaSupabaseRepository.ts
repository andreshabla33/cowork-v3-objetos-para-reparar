/**
 * @module infrastructure/adapters/MetricasEmpresaSupabaseRepository
 * @description Supabase implementation of IMetricasEmpresaRepository.
 *
 * Encapsula queries de `metricas_empresa`, `empresas` y `miembros_espacio`
 * para analytics segmentadas por empresa.
 *
 * Ref: Supabase JS v2 — PostgREST select.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  IMetricasEmpresaRepository,
  MetricaDiaria,
  EmpresaMetrica,
} from '@/core/domain/ports/IMetricasEmpresaRepository';

export class MetricasEmpresaSupabaseRepository implements IMetricasEmpresaRepository {
  async obtenerMetricasPorEspacio(espacioId: string, diasAtras: number): Promise<MetricaDiaria[]> {
    const fechaDesde = new Date();
    fechaDesde.setDate(fechaDesde.getDate() - diasAtras);

    const { data, error } = await supabase
      .from('metricas_empresa')
      .select('*')
      .eq('espacio_id', espacioId)
      .gte('fecha', fechaDesde.toISOString().split('T')[0])
      .order('fecha', { ascending: true });

    if (error) throw error;
    return (data ?? []) as MetricaDiaria[];
  }

  async obtenerEmpresasDelEspacio(espacioId: string): Promise<EmpresaMetrica[]> {
    const { data: miembros } = await supabase
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacioId)
      .not('empresa_id', 'is', null);

    const empresaIds = (miembros ?? [])
      .map((m: { empresa_id: string | null }) => m.empresa_id)
      .filter((id): id is string => Boolean(id));

    if (empresaIds.length === 0) return [];

    const { data, error } = await supabase
      .from('empresas')
      .select('id, nombre')
      .in('id', empresaIds);

    if (error) throw error;
    return (data ?? []) as EmpresaMetrica[];
  }
}

export const metricasEmpresaRepository = new MetricasEmpresaSupabaseRepository();
