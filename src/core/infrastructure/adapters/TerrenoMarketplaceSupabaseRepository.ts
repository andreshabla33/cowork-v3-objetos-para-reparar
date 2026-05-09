/**
 * @module infrastructure/adapters/TerrenoMarketplaceSupabaseRepository
 * @description Supabase adapter implementando `ITerrenoMarketplaceRepository`.
 *
 * Cierra deuda residual del ITEM 6: el módulo `terrenosMarketplace.ts`
 * (movido AS-IS en commit `47ca6d9` durante ITEM 12 hojas-8) ahora tiene
 * Repository pattern formal con port en Domain + clase singleton en
 * Infrastructure.
 *
 * El módulo `terrenosMarketplace.ts` se mantiene como facade compat que
 * re-exporta tipos/constants desde Domain y delega las funciones async
 * a este singleton.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { TerrenoMarketplace, ZonaEmpresa } from '@/types';
import type {
  EmpresaPublica,
  ObjetoEspacio,
} from '@/core/domain/entities/terrenoMarketplace';
import type { ITerrenoMarketplaceRepository } from '@/core/domain/ports/ITerrenoMarketplaceRepository';

const log = logger.child('terreno-marketplace-repository');

export class TerrenoMarketplaceSupabaseRepository implements ITerrenoMarketplaceRepository {
  async cargarTerrenosPublicos(espacioId: string): Promise<TerrenoMarketplace[]> {
    const { data, error } = await supabase
      .from('terrenos_marketplace')
      .select('*')
      .eq('espacio_id', espacioId)
      .in('estado', ['disponible', 'reservado'])
      .order('destacado', { ascending: false })
      .order('orden_visual');

    if (error) {
      log.warn('Error cargando terrenos públicos', { error: error.message, espacioId });
      return [];
    }
    return (data ?? []) as TerrenoMarketplace[];
  }

  async cargarTodosTerrenos(espacioId: string): Promise<TerrenoMarketplace[]> {
    const { data, error } = await supabase
      .from('terrenos_marketplace')
      .select('*')
      .eq('espacio_id', espacioId)
      .order('created_at', { ascending: false });

    if (error) {
      log.warn('Error cargando todos los terrenos', { error: error.message, espacioId });
      return [];
    }
    return (data ?? []) as TerrenoMarketplace[];
  }

  async cargarZonasPublicas(espacioId: string): Promise<ZonaEmpresa[]> {
    const { data, error } = await supabase
      .from('zonas_empresa')
      .select(
        'id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, es_comun, spawn_x, spawn_y, modelo_url, empresa:empresas(nombre, logo_url)',
      )
      .eq('espacio_id', espacioId)
      .eq('estado', 'activa');

    if (error) {
      log.warn('Error cargando zonas públicas', { error: error.message, espacioId });
      return [];
    }
    return (data ?? []) as ZonaEmpresa[];
  }

  async cargarEmpresasPublicas(espacioId: string): Promise<EmpresaPublica[]> {
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nombre, industria, tamano, descripcion, logo_url, sitio_web')
      .eq('espacio_id', espacioId);

    if (error) {
      log.warn('Error cargando empresas públicas', { error: error.message, espacioId });
      return [];
    }

    // Count miembros por empresa (1 query separada).
    const { data: miembrosData } = await supabase
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacioId)
      .not('empresa_id', 'is', null);

    const conteo: Record<string, number> = {};
    for (const row of (miembrosData ?? []) as Array<{ empresa_id: string | null }>) {
      if (row.empresa_id) conteo[row.empresa_id] = (conteo[row.empresa_id] ?? 0) + 1;
    }

    return ((data ?? []) as Array<{
      id: string;
      nombre: string;
      industria: string | null;
      tamano: string | null;
      descripcion: string | null;
      logo_url: string | null;
      sitio_web: string | null;
    }>).map((e) => ({
      ...e,
      miembros_count: conteo[e.id] ?? 0,
    }));
  }

  async cargarObjetosPublicos(espacioId: string): Promise<ObjetoEspacio[]> {
    const { data, error } = await supabase
      .from('espacio_objetos')
      .select(
        'id, tipo, nombre, posicion_x, posicion_y, posicion_z, rotacion_y, escala_x, escala_y, escala_z, owner_id, modelo_url',
      )
      .eq('espacio_id', espacioId);

    if (error) {
      log.warn('Error cargando objetos públicos', { error: error.message, espacioId });
      return [];
    }
    return (data ?? []) as ObjetoEspacio[];
  }

  async guardarTerreno(
    terreno: Partial<TerrenoMarketplace> & { espacio_id: string },
  ): Promise<TerrenoMarketplace | null> {
    const payload = { ...terreno, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('terrenos_marketplace')
      .upsert(payload)
      .select('*')
      .single();

    if (error) {
      log.warn('Error guardando terreno', { error: error.message, espacioId: terreno.espacio_id });
      return null;
    }
    return data as TerrenoMarketplace;
  }

  async eliminarTerreno(id: string): Promise<boolean> {
    const { error } = await supabase.from('terrenos_marketplace').delete().eq('id', id);
    if (error) {
      log.warn('Error eliminando terreno', { error: error.message, id });
      return false;
    }
    return true;
  }

  async reservarTerreno(terrenoId: string, usuarioId: string): Promise<boolean> {
    const reservaHasta = new Date();
    reservaHasta.setHours(reservaHasta.getHours() + 48);

    const { error } = await supabase
      .from('terrenos_marketplace')
      .update({
        estado: 'reservado',
        reservado_por: usuarioId,
        reservado_hasta: reservaHasta.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', terrenoId)
      .eq('estado', 'disponible');

    if (error) {
      log.warn('Error reservando terreno', { error: error.message, terrenoId });
      return false;
    }
    return true;
  }
}

export const terrenoMarketplaceRepository: ITerrenoMarketplaceRepository =
  new TerrenoMarketplaceSupabaseRepository();
