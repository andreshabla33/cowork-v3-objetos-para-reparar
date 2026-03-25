import type { CatalogoObjeto3D } from '@/types/objetos3d';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { FACTOR_ESCALA_OBJETOS_ESCENA } from './shared';

export type ObjetoRuntime3D = EspacioObjeto & Partial<
  Pick<
    CatalogoObjeto3D,
    | 'built_in_geometry'
    | 'built_in_color'
    | 'ancho'
    | 'alto'
    | 'profundidad'
    | 'es_sentable'
    | 'sit_offset_x'
    | 'sit_offset_y'
    | 'sit_offset_z'
    | 'sit_rotation_y'
    | 'es_interactuable'
    | 'interaccion_tipo'
    | 'interaccion_radio'
    | 'interaccion_emoji'
    | 'interaccion_label'
  >
>;

export const normalizarNumeroRuntime3D = (
  valor: number | string | null | undefined,
  fallback: number
) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
};

const sonValoresParecidos = (a: number, b: number, tolerancia = 0.001) => {
  return Math.abs(a - b) <= tolerancia;
};

export const obtenerFactoresEscalaObjetoRuntime = (objeto: ObjetoRuntime3D) => {
  const baseAncho = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.ancho ?? objeto.ancho, 1));
  const baseAlto = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.alto ?? objeto.alto, 1));
  const baseProfundidad = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.profundidad ?? objeto.profundidad, 1));
  const escalaXPersistida = Math.abs(normalizarNumeroRuntime3D(objeto.escala_x, 1));
  const escalaYPersistida = Math.abs(normalizarNumeroRuntime3D(objeto.escala_y, 1));
  const escalaZPersistida = Math.abs(normalizarNumeroRuntime3D(objeto.escala_z, 1));
  const tieneCatalogoBase = !!objeto.catalogo || !!objeto.ancho || !!objeto.alto || !!objeto.profundidad;

  const usaEscalaLegacyAbsoluta = tieneCatalogoBase
    && sonValoresParecidos(escalaXPersistida, baseAncho)
    && sonValoresParecidos(escalaYPersistida, baseAlto)
    && sonValoresParecidos(escalaZPersistida, baseProfundidad);

  if (usaEscalaLegacyAbsoluta) {
    return { x: 1, y: 1, z: 1 };
  }

  return {
    x: escalaXPersistida > 0.05 ? escalaXPersistida : 1,
    y: escalaYPersistida > 0.05 ? escalaYPersistida : 1,
    z: escalaZPersistida > 0.05 ? escalaZPersistida : 1,
  };
};

export const obtenerDimensionesObjetoRuntime = (objeto: ObjetoRuntime3D) => {
  const baseAncho = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.ancho ?? objeto.ancho, 1));
  const baseAlto = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.alto ?? objeto.alto, 1));
  const baseProfundidad = Math.abs(normalizarNumeroRuntime3D(objeto.catalogo?.profundidad ?? objeto.profundidad, 1));
  const escala = obtenerFactoresEscalaObjetoRuntime(objeto);
  const escalaNormalizacion = Math.abs(normalizarNumeroRuntime3D(objeto.escala_normalizacion ?? objeto.catalogo?.escala_normalizacion, 1));

  const ancho = baseAncho * escala.x * escalaNormalizacion * FACTOR_ESCALA_OBJETOS_ESCENA;
  const alto = baseAlto * escala.y * escalaNormalizacion * FACTOR_ESCALA_OBJETOS_ESCENA;
  const profundidad = baseProfundidad * escala.z * escalaNormalizacion * FACTOR_ESCALA_OBJETOS_ESCENA;

  return {
    ancho: ancho > 0.05 ? ancho : 1,
    alto: alto > 0.05 ? alto : 1,
    profundidad: profundidad > 0.05 ? profundidad : 1,
  };
};

export const obtenerModeloRuntimeObjeto = (
  objeto: Partial<Pick<CatalogoObjeto3D, 'built_in_geometry' | 'built_in_color'>> & { modelo_url?: string | null }
) => {
  return objeto.modelo_url || (objeto.built_in_geometry
    ? `builtin:${objeto.built_in_geometry}:${(objeto.built_in_color || '#6366f1').replace('#', '')}`
    : null);
};

export const esObjetoReclamable = (objeto: ObjetoRuntime3D) => {
  if (typeof objeto.es_reclamable === 'boolean') {
    return objeto.es_reclamable;
  }

  const tipo = (objeto.tipo || '').trim().toLowerCase();
  const interaccion = (objeto.interaccion_tipo || '').trim().toLowerCase();

  return (
    tipo.includes('escritorio') ||
    tipo.includes('desk') ||
    interaccion === 'reclamar_escritorio' ||
    interaccion === 'claim_desk'
  );
};

export const esObjetoSentable = (objeto: ObjetoRuntime3D) => {
  return !!objeto.es_sentable;
};

export const esObjetoInteractuable = (objeto: ObjetoRuntime3D) => {
  if (typeof objeto.interactuable === 'boolean') {
    return objeto.interactuable;
  }

  if (typeof objeto.es_interactuable === 'boolean') {
    return objeto.es_interactuable;
  }

  return !!objeto.interaccion_tipo;
};

export const obtenerRadioInteraccionObjeto = (objeto: ObjetoRuntime3D, fallback: number) => {
  const radio = normalizarNumeroRuntime3D(objeto.interaccion_radio, fallback);
  return radio > 0.1 ? radio : fallback;
};

export const obtenerEtiquetaInteraccionObjeto = (objeto: ObjetoRuntime3D, fallback: string) => {
  const etiqueta = (objeto.interaccion_label || '').trim();
  return etiqueta || fallback;
};

export const obtenerEmojiInteraccionObjeto = (objeto: ObjetoRuntime3D, fallback: string) => {
  const emoji = (objeto.interaccion_emoji || '').trim();
  return emoji || fallback;
};

export const rotarOffsetXZ = (offsetX: number, offsetZ: number, rotacionY: number) => {
  const cos = Math.cos(rotacionY);
  const sin = Math.sin(rotacionY);

  return {
    x: offsetX * cos - offsetZ * sin,
    z: offsetX * sin + offsetZ * cos,
  };
};
