import { supabase } from '@/lib/supabase';
import type { ZonaEmpresa } from '@/types';
import type { PlantillaEspacio } from '../domain/entities/plantillasEspacio';
import type { IInyectorPlantillaEspacio } from '../application/usecases/RegistrarEmpresaConPlantillaUseCase';

interface CatalogoPlantilla {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  modelo_url: string | null;
  built_in_geometry: string | null;
  built_in_color: string | null;
  ancho: number | string;
  alto: number | string;
  profundidad: number | string;
  es_sentable: boolean;
  es_interactuable: boolean;
  configuracion_geometria?: Record<string, unknown> | null;
  escala_normalizacion?: number | null;
}

const clamp = (valor: number, minimo: number, maximo: number) => {
  return Math.min(maximo, Math.max(minimo, valor));
};

const normalizarNumero = (valor: number | string | null | undefined, fallback: number) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
};

const normalizarRotacion = (valor?: number) => {
  const rotacion = valor ?? 0;
  return Number.isFinite(rotacion) ? rotacion : 0;
};

const construirModeloUrl = (catalogo: CatalogoPlantilla) => {
  if (catalogo.modelo_url) {
    return catalogo.modelo_url;
  }

  if (catalogo.built_in_geometry) {
    return `builtin:${catalogo.built_in_geometry}:${(catalogo.built_in_color || '#6366f1').replace('#', '')}`;
  }

  return 'builtin:cubo:6366f1';
};

const usaDimensionRotada = (rotacionY: number) => {
  const pi = Math.PI;
  const normalizada = ((rotacionY % pi) + pi) % pi;
  return Math.abs(normalizada - pi / 2) < 0.001;
};

export class InyectorPlantillaEspacio implements IInyectorPlantillaEspacio {
  async sincronizarPlantilla(params: {
    espacioId: string;
    empresaId: string;
    userId: string;
    zona: ZonaEmpresa;
    plantilla: PlantillaEspacio;
  }): Promise<void> {
    const slugs = Array.from(new Set(params.plantilla.objetos.map((objeto) => objeto.slug_catalogo)));
    const { data: catalogoData, error: catalogoError } = await supabase
      .from('catalogo_objetos_3d')
      .select('id, slug, nombre, tipo, modelo_url, built_in_geometry, built_in_color, ancho, alto, profundidad, es_sentable, es_interactuable, configuracion_geometria, escala_normalizacion')
      .in('slug', slugs);

    if (catalogoError) {
      throw catalogoError;
    }

    const catalogo = new Map((catalogoData || []).map((item) => [String((item as CatalogoPlantilla).slug), item as CatalogoPlantilla]));
    const faltantes = slugs.filter((slug) => !catalogo.has(slug));

    if (faltantes.length > 0) {
      throw new Error(`Faltan objetos del catálogo para la plantilla: ${faltantes.join(', ')}`);
    }

    const { error: deleteError } = await supabase
      .from('espacio_objetos')
      .delete()
      .eq('espacio_id', params.espacioId)
      .eq('empresa_id', params.empresaId)
      .eq('es_de_plantilla', true);

    if (deleteError) {
      throw deleteError;
    }

    const centroX = normalizarNumero(params.zona.posicion_x, 0) / 16;
    const centroZ = normalizarNumero(params.zona.posicion_y, 0) / 16;
    const mitadAnchoZona = Math.max(normalizarNumero(params.zona.ancho, params.plantilla.zona.ancho_metros * 16) / 16 / 2, 1);
    const mitadAltoZona = Math.max(normalizarNumero(params.zona.alto, params.plantilla.zona.alto_metros * 16) / 16 / 2, 1);
    const margen = 0.35;

    const filas = params.plantilla.objetos.map((objetoPlantilla) => {
      const catalogoObjeto = catalogo.get(objetoPlantilla.slug_catalogo);
      if (!catalogoObjeto) {
        throw new Error(`No se encontró el objeto ${objetoPlantilla.slug_catalogo} en el catálogo.`);
      }

      const rotacionY = normalizarRotacion(objetoPlantilla.rotacion_y);
      const escalaX = normalizarNumero(objetoPlantilla.escala_x, 1);
      const escalaY = normalizarNumero(objetoPlantilla.escala_y, 1);
      const escalaZ = normalizarNumero(objetoPlantilla.escala_z, 1);
      const anchoBase = normalizarNumero(catalogoObjeto.ancho, 1);
      const altoBase = normalizarNumero(catalogoObjeto.alto, 1);
      const profundidadBase = normalizarNumero(catalogoObjeto.profundidad, 1);
      const rotada = usaDimensionRotada(rotacionY);
      const huellaAncho = (rotada ? profundidadBase : anchoBase) * escalaX;
      const huellaProfundidad = (rotada ? anchoBase : profundidadBase) * escalaZ;
      const minX = centroX - Math.max(mitadAnchoZona - huellaAncho / 2 - margen, 0.1);
      const maxX = centroX + Math.max(mitadAnchoZona - huellaAncho / 2 - margen, 0.1);
      const minZ = centroZ - Math.max(mitadAltoZona - huellaProfundidad / 2 - margen, 0.1);
      const maxZ = centroZ + Math.max(mitadAltoZona - huellaProfundidad / 2 - margen, 0.1);
      const posicionX = clamp(centroX + objetoPlantilla.offset_x, minX, maxX);
      const posicionZ = clamp(centroZ + objetoPlantilla.offset_z, minZ, maxZ);
      const posicionY = (altoBase * escalaY) / 2;

      return {
        espacio_id: params.espacioId,
        empresa_id: params.empresaId,
        modelo_url: construirModeloUrl(catalogoObjeto),
        tipo: catalogoObjeto.tipo,
        nombre: catalogoObjeto.nombre,
        posicion_x: Number(posicionX.toFixed(4)),
        posicion_y: Number(posicionY.toFixed(4)),
        posicion_z: Number(posicionZ.toFixed(4)),
        rotacion_x: 0,
        rotacion_y: rotacionY,
        rotacion_z: 0,
        escala_x: escalaX,
        escala_y: escalaY,
        escala_z: escalaZ,
        owner_id: null,
        catalogo_id: catalogoObjeto.id,
        interactuable: Boolean(catalogoObjeto.es_interactuable || catalogoObjeto.es_sentable),
        configuracion_geometria: catalogoObjeto.configuracion_geometria ?? null,
        escala_normalizacion: catalogoObjeto.escala_normalizacion ?? 1,
        es_de_plantilla: true,
        plantilla_origen: params.plantilla.id,
      };
    });

    if (filas.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from('espacio_objetos')
      .insert(filas);

    if (insertError) {
      throw insertError;
    }
  }
}
