/**
 * @module infrastructure/adapters/ZonaEmpresaSupabaseRepository
 * @description Supabase implementation of IZonaEmpresaRepository.
 * Encapsulates all `zonas_empresa` table queries plus the activity-log
 * side effect that every mutation produces.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Note: the file `lib/autorizacionesEmpresa.ts` keeps thin wrapper
 * functions that delegate here for backwards-compat with legacy callers.
 *
 * Ref: Supabase JS v2 — .upsert, .delete with count: 'exact', .or chain.
 *
 * Bug histórico (fix 2026-04-21): Supabase .delete() NO devuelve error HTTP
 * cuando una política RLS USING filtra la fila — devuelve `{ error: null }`
 * con 0 filas afectadas. Fix: pedir `count: 'exact'` y validar.
 */

import { supabase } from '@/lib/supabase';
import { normalizarTipoSuelo } from '../../domain/entities';
import type {
  ActualizarEstadoZonaInput,
  AplicarLayoutInput,
  EliminarZonaInput,
  GuardarZonaInput,
  IZonaEmpresaRepository,
} from '../../domain/ports/IZonaEmpresaRepository';
import type { ZonaEmpresa } from '@/types';

interface ActividadLogPayload {
  usuario_id: string | null;
  empresa_id: string | null;
  espacio_id: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: string | null;
  descripcion?: string | null;
  datos_extra?: Record<string, unknown>;
}

async function registrarActividad(payload: ActividadLogPayload): Promise<void> {
  try {
    await supabase.from('actividades_log').insert({
      usuario_id: payload.usuario_id,
      empresa_id: payload.empresa_id,
      espacio_id: payload.espacio_id,
      accion: payload.accion,
      entidad: payload.entidad ?? null,
      entidad_id: payload.entidad_id ?? null,
      descripcion: payload.descripcion ?? null,
      datos_extra: payload.datos_extra ?? {},
    });
  } catch (error) {
    console.warn('No se pudo registrar actividad:', error);
  }
}

export class ZonaEmpresaSupabaseRepository implements IZonaEmpresaRepository {
  async cargarZonas(espacioId: string): Promise<ZonaEmpresa[]> {
    const { data, error } = await supabase
      .from('zonas_empresa')
      .select(
        'id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, es_comun, spawn_x, spawn_y, modelo_url, tipo_suelo, configuracion, empresa:empresas(nombre, logo_url)',
      )
      .eq('espacio_id', espacioId)
      .order('creado_en', { ascending: true });

    if (error) {
      console.warn('Error cargando zonas empresa:', error.message);
      return [];
    }

    return ((data || []) as ZonaEmpresa[])
      .filter((zona) => {
        const conf = zona.configuracion as Record<string, unknown> | null | undefined;
        if (!conf || typeof conf !== 'object') return true;
        if (conf.plantilla_zona_hija) return false;
        if (conf.tipo_subsuelo === 'decorativo') return false;
        return true;
      })
      .map((zona) => ({
        ...zona,
        tipo_suelo: normalizarTipoSuelo(zona.tipo_suelo),
      }));
  }

  async cargarZonaActual(espacioId: string, empresaId: string): Promise<ZonaEmpresa | null> {
    const { data, error } = await supabase
      .from('zonas_empresa')
      .select(
        'id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, spawn_x, spawn_y, modelo_url, tipo_suelo, configuracion',
      )
      .eq('espacio_id', espacioId)
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (error) {
      console.warn('Error cargando zona actual:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      ...(data as ZonaEmpresa),
      tipo_suelo: normalizarTipoSuelo((data as ZonaEmpresa).tipo_suelo),
    };
  }

  async actualizarEstado(input: ActualizarEstadoZonaInput): Promise<boolean> {
    const { error } = await supabase
      .from('zonas_empresa')
      .update({
        estado: input.estado,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', input.zonaId);

    if (error) {
      console.warn('Error actualizando estado de zona:', error.message);
      return false;
    }

    const accion =
      input.estado === 'activa' ? 'zona_empresa_reactivada' : 'zona_empresa_inactivada';
    await registrarActividad({
      usuario_id: input.usuarioId ?? null,
      empresa_id: input.empresaId ?? null,
      espacio_id: input.espacioId,
      accion,
      entidad: 'zonas_empresa',
      entidad_id: input.zonaId,
      descripcion: input.estado === 'activa' ? 'Zona reactivada' : 'Zona inactivada',
    });

    return true;
  }

  async eliminar(input: EliminarZonaInput): Promise<boolean> {
    const { error, count } = await supabase
      .from('zonas_empresa')
      .delete({ count: 'exact' })
      .eq('id', input.zonaId);

    if (error) {
      console.warn('Error eliminando zona:', error.message);
      return false;
    }

    if (!count || count === 0) {
      console.warn('Zona no eliminada: 0 filas afectadas (RLS policy o id inexistente)', {
        zonaId: input.zonaId,
        espacioId: input.espacioId,
      });
      return false;
    }

    await registrarActividad({
      usuario_id: input.usuarioId ?? null,
      empresa_id: input.empresaId ?? null,
      espacio_id: input.espacioId,
      accion: 'zona_empresa_eliminada',
      entidad: 'zonas_empresa',
      entidad_id: input.zonaId,
      descripcion: 'Zona de empresa eliminada',
    });

    return true;
  }

  async guardar(input: GuardarZonaInput): Promise<ZonaEmpresa | null> {
    if (!(input.esComun ?? false) && !input.empresaId) {
      console.warn('Error guardando zona: una zona privada requiere empresa_id');
      return null;
    }

    const tipoSueloNormalizado =
      input.tipoSuelo == null ? undefined : normalizarTipoSuelo(input.tipoSuelo);

    const { data, error } = await supabase
      .from('zonas_empresa')
      .upsert({
        id: input.zonaId || undefined,
        espacio_id: input.espacioId,
        empresa_id: input.esComun ? null : input.empresaId ?? null,
        nombre_zona: input.nombreZona ?? null,
        posicion_x: input.posicionX,
        posicion_y: input.posicionY,
        ancho: input.ancho,
        alto: input.alto,
        color: input.color ?? null,
        estado: input.estado ?? 'activa',
        es_comun: input.esComun ?? false,
        spawn_x: input.spawnX ?? 0,
        spawn_y: input.spawnY ?? 0,
        modelo_url: input.modeloUrl ?? null,
        configuracion: input.configuracion ?? undefined,
        ...(tipoSueloNormalizado ? { tipo_suelo: tipoSueloNormalizado } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .select(
        'id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, es_comun, spawn_x, spawn_y, modelo_url, tipo_suelo, configuracion',
      )
      .single();

    if (error) {
      console.warn('Error guardando zona:', error.message);
      return null;
    }

    await registrarActividad({
      usuario_id: input.usuarioId ?? null,
      empresa_id: input.empresaId ?? null,
      espacio_id: input.espacioId,
      accion: input.zonaId ? 'zona_empresa_actualizada' : 'zona_empresa_creada',
      entidad: 'zonas_empresa',
      entidad_id: data?.id ?? null,
      descripcion: input.zonaId ? 'Zona de empresa actualizada' : 'Zona de empresa creada',
      datos_extra: {
        nombre_zona: input.nombreZona,
        ancho: input.ancho,
        alto: input.alto,
        color: input.color,
        es_comun: input.esComun ?? false,
      },
    });

    if (!data) return null;
    return {
      ...(data as ZonaEmpresa),
      tipo_suelo: normalizarTipoSuelo((data as ZonaEmpresa).tipo_suelo),
    };
  }

  async aplicarLayout(input: AplicarLayoutInput): Promise<boolean> {
    try {
      if (input.eliminarExistentes) {
        const { error: delError, count: delCount } = await supabase
          .from('zonas_empresa')
          .delete({ count: 'exact' })
          .eq('espacio_id', input.espacioId);

        if (delError) {
          console.warn('Error eliminando zonas existentes:', delError.message);
          return false;
        }
        if (delCount === null) {
          console.warn('No se pudo determinar filas afectadas al limpiar zonas previas.');
        }
      }

      const filas = input.zonas.map((zona) => ({
        espacio_id: input.espacioId,
        empresa_id: zona.empresa_id,
        nombre_zona: zona.nombre_zona,
        posicion_x: zona.posicion_x,
        posicion_y: zona.posicion_y,
        ancho: zona.ancho,
        alto: zona.alto,
        color: zona.color,
        estado: 'activa' as const,
        es_comun: zona.es_comun,
        spawn_x: zona.spawn_x,
        spawn_y: zona.spawn_y,
        actualizado_en: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('zonas_empresa').insert(filas);
      if (insertError) {
        console.warn('Error insertando zonas masivas:', insertError.message);
        return false;
      }

      await registrarActividad({
        usuario_id: input.usuarioId ?? null,
        empresa_id: null,
        espacio_id: input.espacioId,
        accion: 'layout_zonas_generado',
        entidad: 'zonas_empresa',
        descripcion: `Layout automático generado: ${input.zonas.length} zonas (algoritmo: ${input.algoritmo || 'auto'})`,
        datos_extra: {
          total_zonas: input.zonas.length,
          algoritmo: input.algoritmo,
          empresas_count: input.zonas.filter((z) => !z.es_comun).length,
          zona_comun: input.zonas.some((z) => z.es_comun),
        },
      });

      return true;
    } catch (error) {
      console.error('Error en aplicarLayout:', error);
      return false;
    }
  }
}

export const zonaEmpresaRepository = new ZonaEmpresaSupabaseRepository();
