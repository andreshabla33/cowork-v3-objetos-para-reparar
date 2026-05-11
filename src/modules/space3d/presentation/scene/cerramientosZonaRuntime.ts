import type { ZonaEmpresa } from '@/types';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { EstiloVisualArquitectonico } from '@/src/core/domain/entities/estilosVisualesArquitectonicos';
import { resolverConfiguracionCerramientoZona, type LadoCerramientoZona } from '@/src/core/domain/entities/cerramientosZona';
import type { ConfiguracionGeometricaObjeto, TipoMaterialArquitectonico } from '@/src/core/domain/entities/objetosArquitectonicos';

const ESCALA_ZONA_ESCENA = 16;

const crearObjetoCerramientoZona = (payload: {
  zona: ZonaEmpresa;
  lado: LadoCerramientoZona;
  ancho: number;
  alto: number;
  profundidad: number;
  posicionX: number;
  posicionZ: number;
  rotacionY: number;
  builtInGeometry: string;
  colorBase: string;
  opacidad: number;
  estiloVisual: EstiloVisualArquitectonico;
  tipoMaterial: TipoMaterialArquitectonico;
  escalaTextura: number;
  rugosidad: number;
  metalicidad: number;
}): EspacioObjeto => {
  return {
    id: `cerramiento_${payload.zona.id}_${payload.lado}`,
    espacio_id: payload.zona.espacio_id,
    catalogo_id: null,
    modelo_url: '',
    tipo: 'pared',
    nombre: `Cerramiento ${payload.lado}`,
    posicion_x: payload.posicionX,
    posicion_y: payload.alto / 2,
    posicion_z: payload.posicionZ,
    rotacion_x: 0,
    rotacion_y: payload.rotacionY,
    rotacion_z: 0,
    escala_x: 1,
    escala_y: 1,
    escala_z: 1,
    owner_id: null,
    creado_en: '',
    actualizado_en: '',
    built_in_geometry: payload.builtInGeometry,
    built_in_color: payload.colorBase,
    ancho: payload.ancho,
    alto: payload.alto,
    profundidad: payload.profundidad,
    es_interactuable: false,
    configuracion_geometria: {
      tipo_geometria: 'pared',
      tipo_material: payload.tipoMaterial,
      repetir_textura: true,
      escala_textura: payload.escalaTextura,
      estilo_visual: payload.estiloVisual,
      color_base: payload.colorBase,
      opacidad: payload.opacidad,
      rugosidad: payload.rugosidad,
      metalicidad: payload.metalicidad,
      aberturas: [],
    },
  };
};

export const crearParedesCerramientoZona = (zona: ZonaEmpresa): EspacioObjeto[] => {
  const configuracion = resolverConfiguracionCerramientoZona(zona.configuracion, zona.tipo_suelo);
  if (!configuracion) return [];

  const anchoZona = Math.max(1, Number(zona.ancho) / ESCALA_ZONA_ESCENA);
  const altoZona = Math.max(1, Number(zona.alto) / ESCALA_ZONA_ESCENA);
  const centroX = Number(zona.posicion_x) / ESCALA_ZONA_ESCENA;
  const centroZ = Number(zona.posicion_y) / ESCALA_ZONA_ESCENA;
  const semiancho = anchoZona / 2;
  const semialto = altoZona / 2;
  const offset = configuracion.grosor / 2;
  const paredes: EspacioObjeto[] = [];

  if (configuracion.lados.norte) {
    paredes.push(crearObjetoCerramientoZona({
      zona,
      lado: 'norte',
      ancho: anchoZona,
      alto: configuracion.altura,
      profundidad: configuracion.grosor,
      posicionX: centroX,
      posicionZ: centroZ - semialto + offset,
      rotacionY: 0,
      builtInGeometry: configuracion.lado_acceso === 'norte' ? configuracion.geometria_acceso : configuracion.geometria_tramo,
      colorBase: configuracion.color_base,
      opacidad: configuracion.opacidad,
      estiloVisual: configuracion.estilo_visual,
      tipoMaterial: configuracion.tipo_material,
      escalaTextura: configuracion.escala_textura,
      rugosidad: configuracion.rugosidad,
      metalicidad: configuracion.metalicidad,
    }));
  }

  if (configuracion.lados.sur) {
    paredes.push(crearObjetoCerramientoZona({
      zona,
      lado: 'sur',
      ancho: anchoZona,
      alto: configuracion.altura,
      profundidad: configuracion.grosor,
      posicionX: centroX,
      posicionZ: centroZ + semialto - offset,
      rotacionY: 0,
      builtInGeometry: configuracion.lado_acceso === 'sur' ? configuracion.geometria_acceso : configuracion.geometria_tramo,
      colorBase: configuracion.color_base,
      opacidad: configuracion.opacidad,
      estiloVisual: configuracion.estilo_visual,
      tipoMaterial: configuracion.tipo_material,
      escalaTextura: configuracion.escala_textura,
      rugosidad: configuracion.rugosidad,
      metalicidad: configuracion.metalicidad,
    }));
  }

  if (configuracion.lados.oeste) {
    paredes.push(crearObjetoCerramientoZona({
      zona,
      lado: 'oeste',
      ancho: altoZona,
      alto: configuracion.altura,
      profundidad: configuracion.grosor,
      posicionX: centroX - semiancho + offset,
      posicionZ: centroZ,
      rotacionY: Math.PI / 2,
      builtInGeometry: configuracion.lado_acceso === 'oeste' ? configuracion.geometria_acceso : configuracion.geometria_tramo,
      colorBase: configuracion.color_base,
      opacidad: configuracion.opacidad,
      estiloVisual: configuracion.estilo_visual,
      tipoMaterial: configuracion.tipo_material,
      escalaTextura: configuracion.escala_textura,
      rugosidad: configuracion.rugosidad,
      metalicidad: configuracion.metalicidad,
    }));
  }

  if (configuracion.lados.este) {
    paredes.push(crearObjetoCerramientoZona({
      zona,
      lado: 'este',
      ancho: altoZona,
      alto: configuracion.altura,
      profundidad: configuracion.grosor,
      posicionX: centroX + semiancho - offset,
      posicionZ: centroZ,
      rotacionY: Math.PI / 2,
      builtInGeometry: configuracion.lado_acceso === 'este' ? configuracion.geometria_acceso : configuracion.geometria_tramo,
      colorBase: configuracion.color_base,
      opacidad: configuracion.opacidad,
      estiloVisual: configuracion.estilo_visual,
      tipoMaterial: configuracion.tipo_material,
      escalaTextura: configuracion.escala_textura,
      rugosidad: configuracion.rugosidad,
      metalicidad: configuracion.metalicidad,
    }));
  }

  return paredes;
};

export const crearParedesCerramientosZonas = (zonas: ZonaEmpresa[]): EspacioObjeto[] => {
  return zonas.flatMap((zona) => crearParedesCerramientoZona(zona));
};
