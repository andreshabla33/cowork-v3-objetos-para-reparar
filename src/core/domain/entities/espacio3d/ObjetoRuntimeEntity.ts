/**
 * @module domain/entities/espacio3d/ObjetoRuntimeEntity
 *
 * Funciones puras de dominio para cálculo de dimensiones, escala e interacciones
 * de objetos 3D persistentes en el espacio virtual.
 * Clean Architecture: capa de dominio — sin React, Three.js ni Supabase.
 *
 * Migrado desde: components/space3d/objetosRuntime.ts
 */

// ─── Constante de dominio ─────────────────────────────────────────────────────

/**
 * Factor de escala global para objetos del espacio.
 * Centralizado aquí para que los use cases puedan referenciarlo sin depender
 * de `components/space3d/shared.ts` (capa de presentación).
 */
export const FACTOR_ESCALA_OBJETOS_ESPACIO = 1;

// ─── Tipos de dominio ─────────────────────────────────────────────────────────

/**
 * Interfaz estructural mínima que deben cumplir los objetos del espacio 3D
 * para ser procesados por las funciones de runtime (dimensiones, escala, interacción).
 *
 * Diseñada para ser satisfecha por AMBOS:
 *  - ObjetoEspacio3D (objetos persistentes de la BD)
 *  - ObjetoPreview3D (previews de catálogo en modo edición)
 *
 * Los campos son todos opcionales/nullables porque provienen de filas de BD
 * donde null es un valor válido.
 */
export interface ObjetoRuntime3D {
  ancho?: number | string | null;
  alto?: number | string | null;
  profundidad?: number | string | null;
  escala_x?: number | string | null;
  escala_y?: number | string | null;
  escala_z?: number | string | null;
  escala_normalizacion?: number | null;
  tipo?: string | null;
  modelo_url?: string | null;
  built_in_geometry?: string | null;
  built_in_color?: string | null;
  es_reclamable?: boolean;
  es_sentable?: boolean;
  interactuable?: boolean;
  es_interactuable?: boolean;
  interaccion_tipo?: string | null;
  interaccion_radio?: number | string | null;
  interaccion_label?: string | null;
  interaccion_emoji?: string | null;
  catalogo?: {
    ancho?: number | string | null;
    alto?: number | string | null;
    profundidad?: number | string | null;
    escala_normalizacion?: number | null;
  } | null;
}

// ─── Funciones de dominio puras ───────────────────────────────────────────────

/** Normaliza un número que puede venir como string/null/undefined */
export const normalizarNumero3D = (
  valor: number | string | null | undefined,
  fallback: number,
): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
};

const sonValoresParecidos = (a: number, b: number, tolerancia = 0.001): boolean =>
  Math.abs(a - b) <= tolerancia;

/** Calcula los factores de escala efectivos de un objeto (detecta el modo legacy) */
export const obtenerEscalaObjeto = (objeto: ObjetoRuntime3D): { x: number; y: number; z: number } => {
  const baseAncho = Math.abs(normalizarNumero3D(objeto.catalogo?.ancho ?? objeto.ancho, 1));
  const baseAlto = Math.abs(normalizarNumero3D(objeto.catalogo?.alto ?? objeto.alto, 1));
  const baseProfundidad = Math.abs(normalizarNumero3D(objeto.catalogo?.profundidad ?? objeto.profundidad, 1));
  const ex = Math.abs(normalizarNumero3D(objeto.escala_x, 1));
  const ey = Math.abs(normalizarNumero3D(objeto.escala_y, 1));
  const ez = Math.abs(normalizarNumero3D(objeto.escala_z, 1));
  const tieneCatalogoBase = !!objeto.catalogo || !!objeto.ancho || !!objeto.alto || !!objeto.profundidad;

  const usaEscalaLegacyAbsoluta =
    tieneCatalogoBase &&
    sonValoresParecidos(ex, baseAncho) &&
    sonValoresParecidos(ey, baseAlto) &&
    sonValoresParecidos(ez, baseProfundidad);

  if (usaEscalaLegacyAbsoluta) return { x: 1, y: 1, z: 1 };

  return {
    x: ex > 0.05 ? ex : 1,
    y: ey > 0.05 ? ey : 1,
    z: ez > 0.05 ? ez : 1,
  };
};

/** Calcula las dimensiones en mundo de un objeto (ancho, alto, profundidad) */
export const obtenerDimensionesObjeto = (
  objeto: ObjetoRuntime3D,
  factorEscenaGlobal = FACTOR_ESCALA_OBJETOS_ESPACIO,
): { ancho: number; alto: number; profundidad: number } => {
  const baseAncho = Math.abs(normalizarNumero3D(objeto.catalogo?.ancho ?? objeto.ancho, 1));
  const baseAlto = Math.abs(normalizarNumero3D(objeto.catalogo?.alto ?? objeto.alto, 1));
  const baseProfundidad = Math.abs(normalizarNumero3D(objeto.catalogo?.profundidad ?? objeto.profundidad, 1));
  const escala = obtenerEscalaObjeto(objeto);
  const escalaNorm = Math.abs(normalizarNumero3D(
    (objeto as ObjetoRuntime3D & { escala_normalizacion?: number | null }).escala_normalizacion
      ?? objeto.catalogo?.escala_normalizacion,
    1,
  ));

  const ancho = baseAncho * escala.x * escalaNorm * factorEscenaGlobal;
  const alto = baseAlto * escala.y * escalaNorm * factorEscenaGlobal;
  const profundidad = baseProfundidad * escala.z * escalaNorm * factorEscenaGlobal;

  return {
    ancho: ancho > 0.05 ? ancho : 1,
    alto: alto > 0.05 ? alto : 1,
    profundidad: profundidad > 0.05 ? profundidad : 1,
  };
};

/** Resuelve la URL del modelo 3D o el identificador builtin */
export const obtenerModeloObjeto = (
  objeto: { built_in_geometry?: string | null; built_in_color?: string | null; modelo_url?: string | null },
): string | null =>
  objeto.modelo_url ||
  (objeto.built_in_geometry
    ? `builtin:${objeto.built_in_geometry}:${(objeto.built_in_color || '#6366f1').replace('#', '')}`
    : null);

/** Indica si un objeto es de tipo escritorio/reclamable */
export const esObjetoReclamable = (objeto: ObjetoRuntime3D): boolean => {
  if (typeof objeto.es_reclamable === 'boolean') return objeto.es_reclamable;
  const tipo = (objeto.tipo || '').toLowerCase();
  const interaccion = (objeto.interaccion_tipo || '').toLowerCase();
  return (
    tipo.includes('escritorio') ||
    tipo.includes('desk') ||
    interaccion === 'reclamar_escritorio' ||
    interaccion === 'claim_desk'
  );
};

/** Indica si un objeto es sentable */
export const esObjetoSentable = (objeto: ObjetoRuntime3D): boolean => !!objeto.es_sentable;

/** Indica si un objeto es interactuable */
export const esObjetoInteractuable = (objeto: ObjetoRuntime3D): boolean => {
  if (typeof objeto.interactuable === 'boolean') return objeto.interactuable;
  if (typeof objeto.es_interactuable === 'boolean') return objeto.es_interactuable;
  return !!objeto.interaccion_tipo;
};

/** Obtiene el radio de interacción de un objeto (con fallback) */
export const obtenerRadioInteraccion = (objeto: ObjetoRuntime3D, fallback: number): number => {
  const radio = normalizarNumero3D(objeto.interaccion_radio, fallback);
  return radio > 0.1 ? radio : fallback;
};

/** Obtiene la etiqueta de interacción de un objeto */
export const obtenerEtiquetaInteraccion = (objeto: ObjetoRuntime3D, fallback: string): string =>
  (objeto.interaccion_label || '').trim() || fallback;

/** Obtiene el emoji de interacción de un objeto */
export const obtenerEmojiInteraccion = (objeto: ObjetoRuntime3D, fallback: string): string =>
  (objeto.interaccion_emoji || '').trim() || fallback;

/** Rota un offset (x, z) por el ángulo Y dado */
export const rotarOffsetXZ = (
  offsetX: number,
  offsetZ: number,
  rotacionY: number,
): { x: number; z: number } => {
  const cos = Math.cos(rotacionY);
  const sin = Math.sin(rotacionY);
  return {
    x: offsetX * cos - offsetZ * sin,
    z: offsetX * sin + offsetZ * cos,
  };
};
