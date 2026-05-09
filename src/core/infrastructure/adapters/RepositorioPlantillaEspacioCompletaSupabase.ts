/**
 * @module infrastructure/adapters/RepositorioPlantillaEspacioCompletaSupabase
 * @description Adapter Supabase para `IRepositorioPlantillaEspacioCompleta`.
 *
 * Encapsula las 3 operaciones de DB (`limpiarEspacio`, `crearZonaBase`,
 * `eliminarZona`) que antes estaban inline en `SettingsZona.tsx`. El método
 * `notificarRecargaEspacio` queda como callback inyectado en factory porque
 * es orchestration UI (setState múltiple + window.reload), no data.
 *
 * Clean Architecture: factory function en lugar de class porque
 * `notificarRecargaEspacio` requiere un closure UI que cambia por consumer.
 * El singleton no aplica — cada caller construye su propia instancia
 * pasando su callback de recarga.
 *
 * Refs:
 * - IRepositorioPlantillaEspacioCompleta (Application port):
 *   src/core/application/usecases/AplicarPlantillaEspacioCompletaUseCase.ts
 * - Tablas: `espacio_objetos`, `zonas_empresa`.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type { IRepositorioPlantillaEspacioCompleta } from '@/core/application/usecases/AplicarPlantillaEspacioCompletaUseCase';
import type { ZonaEmpresa } from '@/types';

export function crearRepositorioPlantillaEspacioCompletaSupabase(
  onRecargaEspacio: (espacioId: string) => Promise<void>,
): IRepositorioPlantillaEspacioCompleta {
  return {
    limpiarEspacio: async (espacioId: string, empresaId: string) => {
      await supabase.from('espacio_objetos').delete().eq('espacio_id', espacioId);
      await supabase
        .from('zonas_empresa')
        .delete()
        .eq('espacio_id', espacioId)
        .eq('empresa_id', empresaId);
    },

    crearZonaBase: async (params) => {
      const { data, error } = await supabase
        .from('zonas_empresa')
        .insert({
          espacio_id: params.espacioId,
          empresa_id: params.empresaId,
          nombre_zona: params.nombre,
          ancho: params.ancho,
          alto: params.alto,
          posicion_x: params.posicion_x,
          posicion_y: params.posicion_y,
          color: params.color,
          estado: 'activa',
          es_comun: false,
          tipo_suelo: params.tipo_suelo,
          configuracion: { plantilla_zona: { id: params.plantillaId } },
        })
        .select()
        .single();

      if (error) throw error;
      return data as ZonaEmpresa;
    },

    eliminarZona: async (zonaId: string) => {
      await supabase.from('zonas_empresa').delete().eq('id', zonaId);
    },

    notificarRecargaEspacio: onRecargaEspacio,
  };
}
