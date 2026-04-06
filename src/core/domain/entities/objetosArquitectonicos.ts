import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import {
  normalizarEstiloVisualArquitectonico,
  resolverPerfilVisualArquitectonico,
  type EstiloVisualArquitectonico,
} from './estilosVisualesArquitectonicos';

export type TipoMaterialArquitectonico = 'ladrillo' | 'madera' | 'yeso' | 'concreto' | 'vidrio' | 'metal';
export type TipoGeometriaProcedural = 'pared' | 'caja' | 'cilindro' | 'plano';
export type TipoAberturaArquitectonica = 'ventana' | 'puerta';
export type FormaAberturaArquitectonica = 'rectangular' | 'arco';

export interface AberturaArquitectonica {
  id: string;
  tipo: TipoAberturaArquitectonica;
  forma: FormaAberturaArquitectonica;
  posicion_x: number;
  posicion_y: number;
  ancho: number;
  alto: number;
  insertar_cerramiento: boolean;
  grosor_marco: number;
  profundidad_marco: number;
}

export interface ConfiguracionGeometricaObjeto {
  tipo_geometria: TipoGeometriaProcedural;
  tipo_material: TipoMaterialArquitectonico;
  estilo_visual?: EstiloVisualArquitectonico | null;
  repetir_textura: boolean;
  escala_textura: number;
  color_base?: string | null;
  opacidad?: number | null;
  rugosidad?: number | null;
  metalicidad?: number | null;
  aberturas: AberturaArquitectonica[];
}

/**
 * Fuente mínima de datos para calcular la geometría de un objeto arquitectónico.
 * Acepta null en los campos para ser compatible con valores provenientes de la BD
 * (ObjetoEspacio3D) y de previews de catálogo (ObjetoPreview3D).
 */
export interface ObjetoArquitectonicoFuente {
  tipo?: string | null;
  built_in_geometry?: string | null;
  built_in_color?: string | null;
  ancho?: number | string | null;
  alto?: number | string | null;
  profundidad?: number | string | null;
  configuracion_geometria?: unknown;
}

const clamp = (valor: number, minimo: number, maximo: number) => {
  return Math.min(maximo, Math.max(minimo, valor));
};

const normalizarNumero = (valor: unknown, fallback: number) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
};

const normalizarColor = (valor?: string | null, fallback = '#94a3b8') => {
  if (!valor) return fallback;
  return valor.startsWith('#') ? valor : `#${valor}`;
};

const CLAVES_CONFIGURACION_GEOMETRICA = new Set([
  'tipo_geometria',
  'tipo_material',
  'estilo_visual',
  'repetir_textura',
  'escala_textura',
  'color_base',
  'opacidad',
  'rugosidad',
  'metalicidad',
  'aberturas',
]);

const tieneConfiguracionGeometricaExplicita = (valor: Record<string, unknown>) => {
  return Object.keys(valor).some((clave) => CLAVES_CONFIGURACION_GEOMETRICA.has(clave));
};

const crearIdAbertura = (prefijo: string, indice: number) => `${prefijo}_${indice + 1}`;

const crearPuertaCentrada = (anchoMuro: number, altoMuro: number, doble = false, conArco = false): AberturaArquitectonica[] => {
  const ancho = clamp(doble ? Math.min(anchoMuro * 0.48, 1.8) : Math.min(anchoMuro * 0.28, 0.95), 0.8, Math.max(0.8, anchoMuro - 0.4));
  const alto = clamp(Math.min(altoMuro * 0.78, 2.2), 1.9, Math.max(1.9, altoMuro - 0.2));
  return [{
    id: crearIdAbertura(doble ? 'puerta_doble' : 'puerta', 0),
    tipo: 'puerta',
    forma: conArco ? 'arco' : 'rectangular',
    posicion_x: 0,
    posicion_y: -altoMuro / 2 + alto / 2,
    ancho,
    alto,
    insertar_cerramiento: !conArco,
    grosor_marco: 0.05,
    profundidad_marco: 0.04,
  }];
};

const crearVentanaCentrada = (anchoMuro: number, altoMuro: number, doble = false): AberturaArquitectonica[] => {
  const anchoVentana = clamp(Math.min(anchoMuro * (doble ? 0.22 : 0.34), 1.35), 0.7, Math.max(0.7, anchoMuro * 0.18));
  const altoVentana = clamp(Math.min(altoMuro * 0.34, 1.2), 0.65, Math.max(0.65, altoMuro * 0.18));
  const alturaCentro = clamp(altoMuro * 0.1, -altoMuro * 0.15, altoMuro * 0.2);
  const offsets = doble ? [-anchoMuro * 0.22, anchoMuro * 0.22] : [0];

  return offsets.map((offset, indice) => ({
    id: crearIdAbertura('ventana', indice),
    tipo: 'ventana',
    forma: 'rectangular',
    posicion_x: offset,
    posicion_y: alturaCentro,
    ancho: anchoVentana,
    alto: altoVentana,
    insertar_cerramiento: true,
    grosor_marco: 0.045,
    profundidad_marco: 0.03,
  }));
};

const crearMamparaVidrioOficina = (
  anchoMuro: number,
  altoMuro: number,
  estiloVisual: EstiloVisualArquitectonico,
): AberturaArquitectonica[] => {
  const perfilVisual = resolverPerfilVisualArquitectonico(estiloVisual);
  const paneles = anchoMuro >= 5.4 ? 4 : anchoMuro >= 3.6 ? 3 : 2;
  const margenLateral = clamp(anchoMuro * 0.05, 0.14, 0.24);
  const montante = clamp(anchoMuro * perfilVisual.composicion.mampara.montante_relativo, 0.05, 0.14);
  const zocalo = clamp(altoMuro * perfilVisual.composicion.mampara.zocalo_relativo, 0.58, 1.1);
  const cabezal = clamp(altoMuro * perfilVisual.composicion.mampara.cabezal_relativo, 0.12, 0.28);
  const anchoUtil = Math.max(0.8, anchoMuro - (margenLateral * 2) - (montante * (paneles - 1)));
  const anchoPanel = Math.max(perfilVisual.composicion.mampara.ancho_panel_minimo, anchoUtil / paneles);
  const altoPanel = clamp(altoMuro - zocalo - cabezal, 1.15, Math.max(1.15, altoMuro - 0.9));
  const posicionY = (-altoMuro / 2 + zocalo) + (altoPanel / 2);
  const anchoBloque = (anchoPanel * paneles) + (montante * (paneles - 1));
  const centroInicial = -(anchoBloque / 2) + (anchoPanel / 2);

  return Array.from({ length: paneles }, (_, indice) => ({
    id: crearIdAbertura('mampara_vidrio', indice),
    tipo: 'ventana',
    forma: 'rectangular',
    posicion_x: centroInicial + (indice * (anchoPanel + montante)),
    posicion_y: posicionY,
    ancho: anchoPanel,
    alto: altoPanel,
    insertar_cerramiento: true,
    grosor_marco: 0.05,
    profundidad_marco: 0.06,
  }));
};

const crearVentanasOficina = (
  anchoMuro: number,
  altoMuro: number,
  cantidad: number,
  estiloVisual: EstiloVisualArquitectonico,
): AberturaArquitectonica[] => {
  const perfilVisual = resolverPerfilVisualArquitectonico(estiloVisual);
  const paneles = cantidad === 2 ? 2 : 1;
  const margenLateral = clamp(anchoMuro * 0.08, 0.18, 0.32);
  const montante = paneles === 2 ? clamp(anchoMuro * perfilVisual.composicion.ventana.montante_relativo, 0.08, 0.18) : 0;
  const zocalo = clamp(altoMuro * perfilVisual.composicion.ventana.zocalo_relativo, 0.72, 1.18);
  const cabezal = clamp(altoMuro * perfilVisual.composicion.ventana.cabezal_relativo, 0.14, 0.32);
  const anchoUtil = Math.max(0.8, anchoMuro - (margenLateral * 2) - (montante * (paneles - 1)));
  const anchoPanel = Math.max(perfilVisual.composicion.ventana.ancho_panel_minimo, anchoUtil / paneles);
  const altoPanel = clamp(altoMuro - zocalo - cabezal, 0.96, Math.max(0.96, altoMuro - 1.08));
  const posicionY = (-altoMuro / 2 + zocalo) + (altoPanel / 2);
  const anchoBloque = (anchoPanel * paneles) + (montante * (paneles - 1));
  const centroInicial = -(anchoBloque / 2) + (anchoPanel / 2);

  return Array.from({ length: paneles }, (_, indice) => ({
    id: crearIdAbertura('ventana_oficina', indice),
    tipo: 'ventana',
    forma: 'rectangular',
    posicion_x: centroInicial + (indice * (anchoPanel + montante)),
    posicion_y: posicionY,
    ancho: anchoPanel,
    alto: altoPanel,
    insertar_cerramiento: true,
    grosor_marco: 0.055,
    profundidad_marco: 0.055,
  }));
};

const normalizarAberturas = (valor: unknown): AberturaArquitectonica[] => {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item, indice) => {
      if (!item || typeof item !== 'object') return null;
      const registro = item as Record<string, unknown>;
      const tipo = registro.tipo === 'puerta' ? 'puerta' : 'ventana';
      const forma = registro.forma === 'arco' ? 'arco' : 'rectangular';
      const ancho = Math.max(0.2, normalizarNumero(registro.ancho, tipo === 'puerta' ? 0.9 : 1.2));
      const alto = Math.max(0.2, normalizarNumero(registro.alto, tipo === 'puerta' ? 2.1 : 1.1));
      return {
        id: String(registro.id || crearIdAbertura(tipo, indice)),
        tipo,
        forma,
        posicion_x: normalizarNumero(registro.posicion_x, 0),
        posicion_y: normalizarNumero(registro.posicion_y, 0),
        ancho,
        alto,
        insertar_cerramiento: registro.insertar_cerramiento !== false,
        grosor_marco: clamp(normalizarNumero(registro.grosor_marco, 0.05), 0.01, 0.2),
        profundidad_marco: clamp(normalizarNumero(registro.profundidad_marco, 0.03), 0.01, 0.2),
      } satisfies AberturaArquitectonica;
    })
    .filter((item): item is AberturaArquitectonica => !!item);
};

const inferirConfiguracionLegacy = (
  builtInGeometry: string,
  tipoObjeto: string | undefined,
  ancho: number,
  alto: number,
  colorBase: string
): ConfiguracionGeometricaObjeto | null => {
  const geometria = builtInGeometry.trim().toLowerCase();
  const tipoNormalizado = (tipoObjeto || '').trim().toLowerCase();

  if (['pared', 'wall', 'muro', 'wall-half', 'wall-brick', 'wall-glass', 'wall-door', 'wall-door-double', 'wall-window', 'wall-window-double', 'wall-arch', 'wall-panel', 'wall-stripe'].includes(geometria) || (geometria === 'box' && tipoNormalizado === 'pared')) {
    const esMamparaVidrio = geometria.includes('glass');
    const esVentanaDobleOficina = geometria.includes('window-double');
    const esVentanaOficina = geometria.includes('window') && !esVentanaDobleOficina;
    const esArco = geometria.includes('arch');
    const estiloVisual: EstiloVisualArquitectonico = 'corporativo';
    const tipo_material: TipoMaterialArquitectonico = geometria.includes('brick')
      ? 'ladrillo'
      : esMamparaVidrio
        ? 'yeso'
      : geometria.includes('panel')
        ? 'madera'
        : geometria.includes('stripe')
          ? 'yeso'
          : 'yeso';

    const aberturas = esMamparaVidrio
      ? crearMamparaVidrioOficina(ancho, alto, estiloVisual)
      : esVentanaDobleOficina
        ? crearVentanasOficina(ancho, alto, 2, estiloVisual)
        : esVentanaOficina
          ? crearVentanasOficina(ancho, alto, 1, estiloVisual)
          : geometria.includes('door-double')
            ? crearPuertaCentrada(ancho, alto, true, false)
            : geometria.includes('door')
              ? crearPuertaCentrada(ancho, alto, false, false)
              : esArco
                ? crearPuertaCentrada(ancho, alto, false, true)
                : [];

    const colorBaseLegacy = esMamparaVidrio
      ? '#c7d0db'
      : (esVentanaDobleOficina || esVentanaOficina || esArco || geometria === 'wall-half' || geometria === 'box' || geometria === 'pared' || geometria === 'wall' || geometria === 'muro')
        ? '#d9dde5'
        : colorBase;

    return {
      tipo_geometria: 'pared',
      tipo_material,
      estilo_visual: estiloVisual,
      repetir_textura: true,
      escala_textura: 1,
      color_base: colorBaseLegacy,
      opacidad: 1,
      rugosidad: esMamparaVidrio ? 0.82 : undefined,
      metalicidad: esMamparaVidrio ? 0.02 : undefined,
      aberturas,
    };
  }

  if (['cylinder', 'cilindro', 'columna', 'wall-column'].includes(geometria)) {
    return {
      tipo_geometria: 'cilindro',
      tipo_material: 'concreto',
      repetir_textura: true,
      escala_textura: 1,
      color_base: colorBase,
      aberturas: [],
    };
  }

  if (['plane', 'plano'].includes(geometria)) {
    return {
      tipo_geometria: 'plano',
      tipo_material: 'yeso',
      repetir_textura: true,
      escala_textura: 1,
      color_base: colorBase,
      aberturas: [],
    };
  }

  if (['box', 'cubo', 'cube'].includes(geometria)) {
    return {
      tipo_geometria: 'caja',
      tipo_material: 'concreto',
      repetir_textura: true,
      escala_textura: 1,
      color_base: colorBase,
      aberturas: [],
    };
  }

  return null;
};

export const normalizarConfiguracionGeometricaObjeto = (fuente: ObjetoArquitectonicoFuente): ConfiguracionGeometricaObjeto | null => {
  const ancho = Math.max(0.1, normalizarNumero(fuente.ancho, 1));
  const alto = Math.max(0.1, normalizarNumero(fuente.alto, 1));
  const color_base = normalizarColor(fuente.built_in_color);
  const configuracionCruda = fuente.configuracion_geometria && typeof fuente.configuracion_geometria === 'object'
    ? fuente.configuracion_geometria as Record<string, unknown>
    : null;
  const configuracionExplicita = configuracionCruda
    ? tieneConfiguracionGeometricaExplicita(configuracionCruda)
    : false;
  const configuracionLegacy = fuente.built_in_geometry
    ? inferirConfiguracionLegacy(fuente.built_in_geometry, fuente.tipo ?? undefined, ancho, alto, color_base)
    : null;

  if (configuracionCruda && configuracionExplicita) {
    const tipo_geometria: TipoGeometriaProcedural = configuracionCruda.tipo_geometria === 'pared'
      ? 'pared'
      : configuracionCruda.tipo_geometria === 'cilindro'
        ? 'cilindro'
        : configuracionCruda.tipo_geometria === 'plano'
          ? 'plano'
          : configuracionCruda.tipo_geometria === 'caja'
            ? 'caja'
            : (configuracionLegacy?.tipo_geometria ?? 'caja');

    const tipo_material: TipoMaterialArquitectonico = configuracionCruda.tipo_material === 'ladrillo'
      ? 'ladrillo'
      : configuracionCruda.tipo_material === 'madera'
        ? 'madera'
        : configuracionCruda.tipo_material === 'concreto'
          ? 'concreto'
          : configuracionCruda.tipo_material === 'vidrio'
            ? 'vidrio'
            : configuracionCruda.tipo_material === 'metal'
              ? 'metal'
              : (configuracionLegacy?.tipo_material ?? 'yeso');

    const aberturas = Array.isArray(configuracionCruda.aberturas)
      ? normalizarAberturas(configuracionCruda.aberturas)
      : (configuracionLegacy?.aberturas ?? []);

    const colorBaseConfigurado = (configuracionCruda.color_base as string | null | undefined)
      || fuente.built_in_color
      || configuracionLegacy?.color_base
      || color_base;

    return {
      tipo_geometria,
      tipo_material,
      estilo_visual: tipo_geometria === 'pared'
        ? normalizarEstiloVisualArquitectonico(configuracionCruda.estilo_visual, configuracionLegacy?.estilo_visual ?? 'corporativo')
        : null,
      repetir_textura: configuracionCruda.repetir_textura !== false,
      escala_textura: clamp(normalizarNumero(configuracionCruda.escala_textura, configuracionLegacy?.escala_textura ?? 1), 0.25, 8),
      color_base: normalizarColor(colorBaseConfigurado, color_base),
      opacidad: clamp(normalizarNumero(configuracionCruda.opacidad, configuracionLegacy?.opacidad ?? (tipo_material === 'vidrio' ? 0.35 : 1)), 0.05, 1),
      rugosidad: clamp(normalizarNumero(configuracionCruda.rugosidad, configuracionLegacy?.rugosidad ?? (tipo_material === 'vidrio' ? 0.08 : 0.75)), 0, 1),
      metalicidad: clamp(normalizarNumero(configuracionCruda.metalicidad, configuracionLegacy?.metalicidad ?? (tipo_material === 'metal' ? 0.8 : (tipo_material === 'vidrio' ? 0.2 : 0.05))), 0, 1),
      aberturas,
    };
  }

  if (configuracionLegacy) return configuracionLegacy;

  return null;
};

export const esObjetoArquitectonicoProcedural = (fuente: ObjetoArquitectonicoFuente) => {
  return !!normalizarConfiguracionGeometricaObjeto(fuente);
};

export type ObjetoArquitectonicoRuntime = Pick<EspacioObjeto,
  | 'id'
  | 'tipo'
  | 'modelo_url'
  | 'built_in_geometry'
  | 'built_in_color'
  | 'ancho'
  | 'alto'
  | 'profundidad'
  | 'posicion_x'
  | 'posicion_y'
  | 'posicion_z'
  | 'rotacion_x'
  | 'rotacion_y'
  | 'rotacion_z'
  | 'escala_x'
  | 'escala_y'
  | 'escala_z'
> & {
  configuracion_geometria?: ConfiguracionGeometricaObjeto | Record<string, unknown> | null;
};
