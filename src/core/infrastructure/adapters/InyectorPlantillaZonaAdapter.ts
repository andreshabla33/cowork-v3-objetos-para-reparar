/**
 * @module infrastructure/adapters/InyectorPlantillaZonaAdapter
 * @description Adapter: inyecta objetos y subzonas de una plantilla de zona.
 *
 * Clean Architecture: Infrastructure layer — implementa IInyectorPlantillaZona.
 * Implementación consolidada desde la ruta legacy (../InyectorPlantillaZona).
 *
 * Ref CLEAN-ARCH-F3 — legacy consolidation 2026-04-07
 */
import { guardarZonaEmpresa } from '@/lib/autorizacionesEmpresa';
import { supabase } from '@/lib/supabase';
import type { ZonaEmpresa } from '@/types';
import type { IInyectorPlantillaZona } from '../../application/usecases/AplicarPlantillaZonaUseCase';
import { normalizarConfiguracionZonaEmpresa } from '../../domain/entities/cerramientosZona';
import type { PlantillaZona } from '../../domain/entities/plantillasEspacio';

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

const construirConfiguracionGeometria = (catalogo: CatalogoPlantilla, params: {
  zonaId: string;
  plantillaId: string;
  claveInstancia: string;
}) => {
  const base = catalogo.configuracion_geometria && typeof catalogo.configuracion_geometria === 'object'
    ? catalogo.configuracion_geometria
    : {};

  return {
    ...base,
    meta_plantilla_zona: {
      zona_id: params.zonaId,
      plantilla_id: params.plantillaId,
      clave_instancia: params.claveInstancia,
      slug_catalogo: catalogo.slug,
    },
  };
};

export class InyectorPlantillaZona implements IInyectorPlantillaZona {
  async sincronizarPlantilla(params: {
    espacioId: string;
    userId: string;
    zona: ZonaEmpresa;
    plantilla: PlantillaZona;
    centroXMetros: number;
    centroZMetros: number;
  }): Promise<{ objetosGenerados: string[]; subzonasGeneradas: string[] }> {
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

    const { error: deleteObjetosError } = await supabase
      .from('espacio_objetos')
      .delete()
      .eq('espacio_id', params.espacioId)
      .like('plantilla_origen', `zona:%:${params.zona.id}`);

    if (deleteObjetosError) {
      throw deleteObjetosError;
    }

    const { data: zonasExistentesData, error: zonasExistentesError } = await supabase
      .from('zonas_empresa')
      .select('id, configuracion')
      .eq('espacio_id', params.espacioId);

    if (zonasExistentesError) {
      throw zonasExistentesError;
    }

    const subzonasExistentes = ((zonasExistentesData || []) as Array<{ id: string; configuracion?: unknown }>).filter((zona) => {
      const configuracion = normalizarConfiguracionZonaEmpresa(zona.configuracion);
      return configuracion.plantilla_zona_hija?.zona_padre_id === params.zona.id;
    });

    if (subzonasExistentes.length > 0) {
      const { error: deleteSubzonasError } = await supabase
        .from('zonas_empresa')
        .delete()
        .in('id', subzonasExistentes.map((subzona) => subzona.id));

      if (deleteSubzonasError) {
        throw deleteSubzonasError;
      }
    }

    const centroX = normalizarNumero(params.centroXMetros, normalizarNumero(params.zona.posicion_x, 0) / 16);
    const centroZ = normalizarNumero(params.centroZMetros, normalizarNumero(params.zona.posicion_y, 0) / 16);
    const mitadAnchoZona = Math.max(normalizarNumero(params.zona.ancho, params.plantilla.ancho_minimo_metros * 16) / 16 / 2, 1);
    const mitadAltoZona = Math.max(normalizarNumero(params.zona.alto, params.plantilla.alto_minimo_metros * 16) / 16 / 2, 1);
    const margenObjetos = 0.35;
    const margenSubzonas = 0.1;
    const plantillaOrigen = `zona:${params.plantilla.id}:${params.zona.id}`;

    const subzonasGeneradas: string[] = [];
    for (const subzona of params.plantilla.subzonas) {
      const anchoSubzonaPx = Math.round(subzona.ancho_metros * 16);
      const altoSubzonaPx = Math.round(subzona.alto_metros * 16);
      const limiteMinX = normalizarNumero(params.zona.posicion_x, 0) - normalizarNumero(params.zona.ancho, 0) / 2 + anchoSubzonaPx / 2 + margenSubzonas * 16;
      const limiteMaxX = normalizarNumero(params.zona.posicion_x, 0) + normalizarNumero(params.zona.ancho, 0) / 2 - anchoSubzonaPx / 2 - margenSubzonas * 16;
      const limiteMinY = normalizarNumero(params.zona.posicion_y, 0) - normalizarNumero(params.zona.alto, 0) / 2 + altoSubzonaPx / 2 + margenSubzonas * 16;
      const limiteMaxY = normalizarNumero(params.zona.posicion_y, 0) + normalizarNumero(params.zona.alto, 0) / 2 - altoSubzonaPx / 2 - margenSubzonas * 16;
      const posicionX = clamp(centroX * 16 + subzona.offset_x * 16, limiteMinX, limiteMaxX);
      const posicionY = clamp(centroZ * 16 + subzona.offset_z * 16, limiteMinY, limiteMaxY);

      const subzonaCreada = await guardarZonaEmpresa({
        espacioId: params.espacioId,
        empresaId: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
        esComun: params.zona.es_comun ?? false,
        nombreZona: subzona.nombre,
        posicionX: Math.round(posicionX),
        posicionY: Math.round(posicionY),
        ancho: anchoSubzonaPx,
        alto: altoSubzonaPx,
        color: subzona.color,
        estado: 'activa',
        usuarioId: params.userId,
        spawnX: Math.round(posicionX),
        spawnY: Math.round(posicionY),
        tipoSuelo: subzona.tipo_suelo,
        configuracion: {
          tipo_subsuelo: 'decorativo',
          plantilla_zona_hija: {
            zona_padre_id: params.zona.id,
            plantilla_id: params.plantilla.id,
            clave_subzona: subzona.clave,
          },
        },
      });

      if (!subzonaCreada?.id) {
        throw new Error(`No se pudo crear la subzona decorativa ${subzona.nombre}.`);
      }

      subzonasGeneradas.push(subzonaCreada.id);
    }

    const superficiesPlantilla = new Map<string, number>();

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
      const minX = centroX - Math.max(mitadAnchoZona - huellaAncho / 2 - margenObjetos, 0.1);
      const maxX = centroX + Math.max(mitadAnchoZona - huellaAncho / 2 - margenObjetos, 0.1);
      const minZ = centroZ - Math.max(mitadAltoZona - huellaProfundidad / 2 - margenObjetos, 0.1);
      const maxZ = centroZ + Math.max(mitadAltoZona - huellaProfundidad / 2 - margenObjetos, 0.1);
      const posicionX = clamp(centroX + objetoPlantilla.offset_x, minX, maxX);
      const posicionZ = clamp(centroZ + objetoPlantilla.offset_z, minZ, maxZ);
      const offsetY = normalizarNumero(objetoPlantilla.offset_y, 0);
      const centroYBase = (altoBase * escalaY) / 2;
      const superficieSoporte = objetoPlantilla.sobre_clave
        ? superficiesPlantilla.get(objetoPlantilla.sobre_clave)
        : undefined;
      const posicionY = superficieSoporte !== undefined
        ? superficieSoporte + centroYBase + offsetY
        : centroYBase + offsetY;
      superficiesPlantilla.set(objetoPlantilla.clave, posicionY + centroYBase);

      return {
        espacio_id: params.espacioId,
        empresa_id: params.zona.es_comun ? null : params.zona.empresa_id ?? null,
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
        configuracion_geometria: construirConfiguracionGeometria(catalogoObjeto, {
          zonaId: params.zona.id,
          plantillaId: params.plantilla.id,
          claveInstancia: objetoPlantilla.clave,
        }),
        escala_normalizacion: catalogoObjeto.escala_normalizacion ?? 1,
        es_de_plantilla: true,
        plantilla_origen: plantillaOrigen,
      };
    });

    const { data: filasInsertadas, error: insertError } = await supabase
      .from('espacio_objetos')
      .insert(filas)
      .select('id');

    if (insertError) {
      throw insertError;
    }

    return {
      objetosGenerados: (filasInsertadas || []).map((fila) => String(fila.id)),
      subzonasGeneradas,
    };
  }
}
