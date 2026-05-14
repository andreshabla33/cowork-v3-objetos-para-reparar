/**
 * @module domain/entities/espacio3d/StencilsPiso
 *
 * Clean Architecture — Domain layer (puro TS, sin React/Three/Supabase).
 *
 * Stencils predefinidos de piso decorativo. Patrón Sims-style: el admin
 * elige un tamaño preset y hace click para colocar — más rápido que el
 * drag-to-draw. El modo `custom` mantiene el drag para casos especiales
 * (sala XL, pasillos largos, etc.).
 *
 * Decisión 2026-05-14: 5 presets + custom. Cubre ~90% de los casos típicos
 * de decoración (alfombra estándar, runner, area rug grande).
 */

export type StencilPisoId =
  | 'small'      // alfombra individual
  | 'medium'     // alfombra reunión
  | 'large'     // alfombra sala
  | 'xlarge'    // alfombra mega salón
  | 'square'    // tile cuadrado
  | 'custom'    // drag-to-draw libre
  | 'eraser';   // click sobre piso existente → eliminar

export interface StencilPiso {
  readonly id: StencilPisoId;
  readonly nombre: string;
  /** Ancho en metros (X world). `null` si `custom` (lo define el drag). */
  readonly ancho: number | null;
  /** Profundidad en metros (Z world). `null` si `custom`. */
  readonly profundidad: number | null;
  /** Etiqueta corta para el botón del picker (ej. "S 2×3"). */
  readonly label: string;
}

/** Catálogo canónico de stencils. Inmutable. */
export const STENCILS_PISO: ReadonlyArray<StencilPiso> = Object.freeze([
  { id: 'small',  nombre: 'Alfombra chica',     ancho: 2, profundidad: 3, label: 'S · 2×3m' },
  { id: 'medium', nombre: 'Alfombra mediana',   ancho: 3, profundidad: 4, label: 'M · 3×4m' },
  { id: 'large',  nombre: 'Alfombra grande',    ancho: 4, profundidad: 6, label: 'L · 4×6m' },
  { id: 'xlarge', nombre: 'Alfombra XL',        ancho: 6, profundidad: 8, label: 'XL · 6×8m' },
  { id: 'square', nombre: 'Tile cuadrado',      ancho: 3, profundidad: 3, label: '□ · 3×3m' },
  { id: 'custom', nombre: 'Personalizado',      ancho: null, profundidad: null, label: '✏ Custom' },
  { id: 'eraser', nombre: 'Borrar pisos',       ancho: null, profundidad: null, label: '🗑 Borrar' },
]);

export const STENCIL_DEFAULT: StencilPisoId = 'medium';

/** Lookup helper — fallback al default si el id no existe. */
export function obtenerStencil(id: StencilPisoId | string | null | undefined): StencilPiso {
  const found = STENCILS_PISO.find((s) => s.id === id);
  return found ?? STENCILS_PISO.find((s) => s.id === STENCIL_DEFAULT)!;
}

/**
 * Tamaño mínimo (m) para considerar válido un drag custom. Evita pisos
 * accidentales de 0×0 cuando el admin hace click sin arrastrar.
 */
export const PISO_CUSTOM_TAMANO_MIN_M = 0.5;
