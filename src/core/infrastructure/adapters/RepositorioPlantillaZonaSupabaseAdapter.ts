/**
 * @module infrastructure/adapters/RepositorioPlantillaZonaSupabaseAdapter
 * @description Adapter Supabase: aplica y elimina plantillas de zona.
 *
 * Clean Architecture: Infrastructure layer — implementa IRepositorioPlantillaZona
 * e IRepositorioEliminarPlantillaZona.
 * Implementación consolidada desde la ruta legacy (../RepositorioPlantillaZonaSupabase).
 *
 * Ref CLEAN-ARCH-F3 — legacy consolidation 2026-04-07
 */
import { guardarZonaEmpresa } from '@/lib/autorizacionesEmpresa';
import { supabase } from '@/lib/supabase';
import type { ZonaEmpresa } from '@/types';
import type { IRepositorioPlantillaZona } from '../../application/usecases/AplicarPlantillaZonaUseCase';
import type { IRepositorioEliminarPlantillaZona } from '../../application/usecases/EliminarPlantillaZonaUseCase';
import { normalizarConfiguracionZonaEmpresa } from '../../domain/entities/cerramientosZona';
import { obtenerPlantillaEspacio, type PlantillaZona } from '../../domain/entities/plantillasEspacio';

const registrarActividad = async (payload: {
  usuario_id: string | null;
  empresa_id: string | null;
  espacio_id: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: string | null;
  descripcion?: string | null;
  datos_extra?: Record<string, unknown>;
}) => {
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
    console.warn('No se pudo registrar actividad de plantilla de zona:', error);
  }
};

export class RepositorioPlantillaZonaSupabase implements IRepositorioPlantillaZona, IRepositorioEliminarPlantillaZona {
  private async resolverTipoSueloOriginalZona(zona: ZonaEmpresa): Promise<string | null> {
    const configuracion = normalizarConfiguracionZonaEmpresa(zona.configuracion);
    if (configuracion.plantilla_zona?.tipo_suelo_original) {
      return configuracion.plantilla_zona.tipo_suelo_original;
    }

    if (configuracion.plantilla_zona && zona.empresa_id) {
      const { data, error } = await supabase
        .from('empresas')
        .select('plantilla_oficina')
        .eq('id', zona.empresa_id)
        .maybeSingle();

      if (!error) {
        const plantillaEmpresa = obtenerPlantillaEspacio(data?.plantilla_oficina);
        if (plantillaEmpresa) {
          return plantillaEmpresa.tipo_suelo;
        }
      }
    }

    return zona.tipo_suelo ?? null;
  }

  async obtenerZonaPorId(zonaId: string): Promise<ZonaEmpresa | null> {
    const { data, error } = await supabase
      .from('zonas_empresa')
      .select('id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, es_comun, spawn_x, spawn_y, modelo_url, tipo_suelo, configuracion')
      .eq('id', zonaId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as ZonaEmpresa | null) ?? null;
  }

  async guardarAplicacionPlantilla(params: {
    zona: ZonaEmpresa;
    userId: string;
    plantilla: PlantillaZona;
    centroXMetros: number;
    centroZMetros: number;
    objetosGenerados: string[];
    subzonasGeneradas: string[];
  }): Promise<ZonaEmpresa> {
    const configuracionActual = normalizarConfiguracionZonaEmpresa(params.zona.configuracion);
    const aplicadaEn = new Date().toISOString();
    const tipoSueloOriginal = await this.resolverTipoSueloOriginalZona(params.zona);

    const zonaActualizada = await guardarZonaEmpresa({
      zonaId: params.zona.id,
      espacioId: params.zona.espacio_id,
      empresaId: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
      esComun: params.zona.es_comun ?? false,
      nombreZona: params.zona.nombre_zona ?? null,
      posicionX: Number(params.zona.posicion_x),
      posicionY: Number(params.zona.posicion_y),
      ancho: Number(params.zona.ancho),
      alto: Number(params.zona.alto),
      color: params.zona.color ?? null,
      estado: params.zona.estado,
      usuarioId: params.userId,
      spawnX: Number(params.zona.spawn_x ?? params.zona.posicion_x),
      spawnY: Number(params.zona.spawn_y ?? params.zona.posicion_y),
      modeloUrl: params.zona.modelo_url ?? null,
      tipoSuelo: tipoSueloOriginal,
      configuracion: {
        ...configuracionActual,
        plantilla_zona: {
          id: params.plantilla.id,
          version: params.plantilla.version,
          editable_por_miembro: params.plantilla.reglas.editable_por_miembro,
          permite_agregar_objetos: params.plantilla.reglas.permite_agregar_objetos,
          permite_mover_objetos: params.plantilla.reglas.permite_mover_objetos,
          aplicada_en: aplicadaEn,
          tipo_suelo_original: tipoSueloOriginal,
          centro_x: params.centroXMetros,
          centro_z: params.centroZMetros,
          objetos_generados: params.objetosGenerados,
          subzonas_generadas: params.subzonasGeneradas,
        },
      },
    });

    if (!zonaActualizada) {
      throw new Error('No se pudo guardar la configuración de la plantilla sobre la zona.');
    }

    await registrarActividad({
      usuario_id: params.userId,
      empresa_id: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
      espacio_id: params.zona.espacio_id,
      accion: 'plantilla_zona_aplicada',
      entidad: 'zonas_empresa',
      entidad_id: params.zona.id,
      descripcion: `Plantilla ${params.plantilla.nombre} aplicada a la zona ${params.zona.nombre_zona || params.zona.id}`,
      datos_extra: {
        plantilla_id: params.plantilla.id,
        plantilla_version: params.plantilla.version,
        objetos_generados: params.objetosGenerados.length,
        subzonas_generadas: params.subzonasGeneradas.length,
      },
    });

    return zonaActualizada;
  }

  async eliminarPlantillaAplicada(params: {
    zona: ZonaEmpresa;
    userId: string;
    plantillaOrigen?: string | null;
  }): Promise<{
    zona: ZonaEmpresa;
    objetosEliminados: number;
    subzonasEliminadas: number;
  }> {
    const configuracionActual = normalizarConfiguracionZonaEmpresa(params.zona.configuracion);
    const configuracionPlantilla = configuracionActual.plantilla_zona;

    if (!configuracionPlantilla?.id) {
      throw new Error('La zona no tiene una plantilla aplicada para eliminar.');
    }

    const plantillaOrigen = params.plantillaOrigen ?? `zona:${configuracionPlantilla.id}:${params.zona.id}`;
    let objetosEliminados = 0;
    let subzonasEliminadas = 0;

    const { data: objetosPrevios, error: objetosPreviosError } = await supabase
      .from('espacio_objetos')
      .select('id')
      .eq('espacio_id', params.zona.espacio_id)
      .eq('plantilla_origen', plantillaOrigen);

    if (objetosPreviosError) {
      throw objetosPreviosError;
    }

    if ((objetosPrevios || []).length > 0) {
      const { error: deleteObjetosError } = await supabase
        .from('espacio_objetos')
        .delete()
        .eq('espacio_id', params.zona.espacio_id)
        .eq('plantilla_origen', plantillaOrigen);

      if (deleteObjetosError) {
        throw deleteObjetosError;
      }

      objetosEliminados = objetosPrevios.length;
    }

    const { data: zonasExistentesData, error: zonasExistentesError } = await supabase
      .from('zonas_empresa')
      .select('id, configuracion')
      .eq('espacio_id', params.zona.espacio_id);

    if (zonasExistentesError) {
      throw zonasExistentesError;
    }

    const subzonasDetectadas = ((zonasExistentesData || []) as Array<{ id: string; configuracion?: unknown }>)
      .filter((zona) => {
        const configuracionZona = normalizarConfiguracionZonaEmpresa(zona.configuracion);
        const plantillaHija = configuracionZona.plantilla_zona_hija;
        return plantillaHija?.zona_padre_id === params.zona.id
          && plantillaHija?.plantilla_id === configuracionPlantilla.id;
      })
      .map((zona) => zona.id);

    const subzonasIds = Array.from(new Set([
      ...((configuracionPlantilla.subzonas_generadas || []).filter(Boolean)),
      ...subzonasDetectadas,
    ]));

    if (subzonasIds.length > 0) {
      const { error: deleteSubzonasError } = await supabase
        .from('zonas_empresa')
        .delete()
        .in('id', subzonasIds);

      if (deleteSubzonasError) {
        throw deleteSubzonasError;
      }

      subzonasEliminadas = subzonasIds.length;
    }

    const zonaActualizada = await guardarZonaEmpresa({
      zonaId: params.zona.id,
      espacioId: params.zona.espacio_id,
      empresaId: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
      esComun: params.zona.es_comun ?? false,
      nombreZona: params.zona.nombre_zona ?? null,
      posicionX: Number(params.zona.posicion_x),
      posicionY: Number(params.zona.posicion_y),
      ancho: Number(params.zona.ancho),
      alto: Number(params.zona.alto),
      color: params.zona.color ?? null,
      estado: params.zona.estado,
      usuarioId: params.userId,
      spawnX: Number(params.zona.spawn_x ?? params.zona.posicion_x),
      spawnY: Number(params.zona.spawn_y ?? params.zona.posicion_y),
      modeloUrl: params.zona.modelo_url ?? null,
      tipoSuelo: configuracionPlantilla.tipo_suelo_original ?? params.zona.tipo_suelo ?? null,
      configuracion: {
        ...configuracionActual,
        plantilla_zona: null,
      },
    });

    if (!zonaActualizada) {
      throw new Error('No se pudo limpiar la configuración de la plantilla en la zona.');
    }

    await registrarActividad({
      usuario_id: params.userId,
      empresa_id: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
      espacio_id: params.zona.espacio_id,
      accion: 'plantilla_zona_eliminada',
      entidad: 'zonas_empresa',
      entidad_id: params.zona.id,
      descripcion: `Plantilla ${configuracionPlantilla.id} eliminada de la zona ${params.zona.nombre_zona || params.zona.id}`,
      datos_extra: {
        plantilla_id: configuracionPlantilla.id,
        objetos_eliminados: objetosEliminados,
        subzonas_eliminadas: subzonasEliminadas,
      },
    });

    return {
      zona: zonaActualizada,
      objetosEliminados,
      subzonasEliminadas,
    };
  }
}

// Alias para compatibilidad con código que use el nombre de adapter explícito
export { RepositorioPlantillaZonaSupabase as RepositorioPlantillaZonaSupabaseAdapter } from './RepositorioPlantillaZonaSupabaseAdapter';
