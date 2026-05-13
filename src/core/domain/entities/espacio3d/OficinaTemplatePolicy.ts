/**
 * @module domain/entities/espacio3d/OficinaTemplatePolicy
 *
 * Clean Architecture — Domain layer (puro). Genera posiciones de DeskAreas
 * en grilla cuadrada estilo "coworking", dado:
 *   - cantidad de miembros (1..100)
 *   - tamaño del preset (ancho × alto)
 *   - centro del área y separación entre desks
 *
 * Algoritmo: grilla cuadrada ⌈√N⌉ × ⌈N/⌈√N⌉⌉, centrada en (centroX, centroZ).
 * Para N=10 → 4×3 (sobran 2 celdas → grilla con últimas filas parciales).
 *
 * Ref: docs Gather "Office Size 1-10/11-20/..." — la app sugiere tamaños
 * pre-armados según headcount; este policy es la versión Domain-puro de
 * esa lógica.
 *
 * Sin acceso a Three/Supabase/React.
 */

import type { PresetDesk } from './PresetDesk';

export interface GridBounds {
  readonly centroX: number;
  readonly centroZ: number;
  /** Distancia mínima entre BORDES de desks adyacentes (m). */
  readonly separacion: number;
}

export interface PosicionDesk {
  readonly indice: number;
  /** Centro del desk en world coords (m). */
  readonly x: number;
  readonly z: number;
  /** Fila y columna en la grilla (0-indexed). */
  readonly fila: number;
  readonly columna: number;
}

/** Cantidad máxima soportada por el wizard de onboarding. */
export const CANTIDAD_MIEMBROS_MAX = 100;
export const CANTIDAD_MIEMBROS_MIN = 1;
/** Separación canónica entre desks (m). Suficiente para que el avatar
 *  camine entre ellos sin colisión visual. */
export const SEPARACION_DESKS_DEFAULT = 1.5;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clampea la cantidad solicitada al rango soportado. La interfaz del
 * onboarding también valida, pero el Domain es la fuente autoritativa.
 */
export function normalizarCantidadMiembros(cantidad: number): number {
  if (Number.isNaN(cantidad)) return CANTIDAD_MIEMBROS_MIN;
  if (cantidad === Number.POSITIVE_INFINITY) return CANTIDAD_MIEMBROS_MAX;
  if (cantidad === Number.NEGATIVE_INFINITY) return CANTIDAD_MIEMBROS_MIN;
  return Math.max(
    CANTIDAD_MIEMBROS_MIN,
    Math.min(CANTIDAD_MIEMBROS_MAX, Math.floor(cantidad)),
  );
}

/**
 * Calcula las dimensiones de la grilla (columnas × filas) para una
 * cantidad N de miembros. Estrategia: ⌈√N⌉ columnas, ⌈N/columnas⌉ filas.
 * Para N=10 → 4 cols, 3 filas (4×3=12 celdas, 2 vacías).
 * Para N=12 → 4×3 exacto. Para N=100 → 10×10 exacto.
 */
export function calcularDimensionesGrilla(cantidad: number): {
  columnas: number;
  filas: number;
} {
  const N = normalizarCantidadMiembros(cantidad);
  const columnas = Math.ceil(Math.sqrt(N));
  const filas = Math.ceil(N / columnas);
  return { columnas, filas };
}

// ─── Generador principal ───────────────────────────────────────────────────

/**
 * Genera las posiciones (centro) de N desks en grilla, centrada en
 * `bounds.centroX/Z`. La separación entre desks adyacentes es
 * `bounds.separacion + preset.bbox.{ancho|alto}` (centro-a-centro), de modo
 * que el GAP visible entre bordes sea exactamente `bounds.separacion`.
 *
 * Las posiciones se devuelven en orden left-to-right, top-to-bottom (lectura).
 */
export function generarPosicionesGridDesks(input: {
  cantidad: number;
  preset: PresetDesk;
  bounds: GridBounds;
}): PosicionDesk[] {
  const N = normalizarCantidadMiembros(input.cantidad);
  const { columnas, filas } = calcularDimensionesGrilla(N);
  const sep = Math.max(input.bounds.separacion, 0);
  const stepX = input.preset.bbox.ancho + sep;
  const stepZ = input.preset.bbox.alto + sep;

  // Origen de la grilla: top-left de la celda (0,0), centrado en bounds.
  // El centro de la grilla cae sobre (bounds.centroX, bounds.centroZ).
  const anchoTotal = (columnas - 1) * stepX;
  const altoTotal = (filas - 1) * stepZ;
  const x0 = input.bounds.centroX - anchoTotal / 2;
  const z0 = input.bounds.centroZ - altoTotal / 2;

  const posiciones: PosicionDesk[] = [];
  let indice = 0;
  for (let f = 0; f < filas && indice < N; f++) {
    for (let c = 0; c < columnas && indice < N; c++) {
      posiciones.push({
        indice,
        x: x0 + c * stepX,
        z: z0 + f * stepZ,
        fila: f,
        columna: c,
      });
      indice += 1;
    }
  }
  return posiciones;
}

/**
 * Calcula el bbox total que ocupará la grilla — útil para validar que cabe
 * dentro de la zona-empresa antes de generar (UI puede previsualizar el
 * tamaño total).
 */
export function calcularBboxTotalGrid(input: {
  cantidad: number;
  preset: PresetDesk;
  separacion: number;
}): { ancho: number; alto: number } {
  const { columnas, filas } = calcularDimensionesGrilla(input.cantidad);
  const sep = Math.max(input.separacion, 0);
  return {
    ancho: columnas * input.preset.bbox.ancho + (columnas - 1) * sep,
    alto: filas * input.preset.bbox.alto + (filas - 1) * sep,
  };
}
