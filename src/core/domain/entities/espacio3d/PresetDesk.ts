/**
 * @module domain/entities/espacio3d/PresetDesk
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Define un "preset" inmutable de DeskArea: dimensiones fijas + lista de
 * muebles a colocar (slug del catálogo + offsets relativos al centro).
 *
 * Por decisión del producto (2026-05-13) hay UN solo preset: el desk
 * estándar de 4.5×4.0m con silla + mesa + monitor. No se permite drag-to-
 * create de dimensiones arbitrarias — el flow es click-to-place del preset.
 *
 * Ref: docs Gather "Best Practices in Office Design" — pre-built desks
 * con tamaño estándar; admin coloca uno por uno (no dibuja rect).
 *   https://support.gather.town/hc/en-us/articles/15910372095508
 */

// ─── Roles visuales del mueble dentro del preset ────────────────────────────

/**
 * Rol funcional/visual de un mueble dentro del preset. Sirve para que el
 * Application capa pueda resolver el `slug_catalogo` real desde el DB en
 * runtime (los slugs son data, pueden mudar; los roles son estables).
 */
export type RolMueblePreset = 'mesa' | 'monitor';

// ─── Componente del preset (1 mueble) ───────────────────────────────────────

/**
 * Un mueble del preset. Coordenadas relativas al CENTRO del bbox del desk.
 * `offsetY` es la Y world absoluta del pivot del mueble (0 = en el suelo).
 * Rotación en radianes alrededor de Y (Three.js r183, eje Y vertical).
 */
export interface MueblePreset {
  readonly rol: RolMueblePreset;
  /** Slug del catálogo (`catalogo_objetos_3d.slug` / `nombre`). */
  readonly slugCatalogo: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
  readonly rotacionY: number;
}

// ─── Preset principal ──────────────────────────────────────────────────────

export interface PresetDesk {
  readonly id: 'standard';
  readonly nombre: string;
  /** Dimensiones FIJAS del bbox en metros. */
  readonly bbox: { readonly ancho: number; readonly alto: number };
  readonly muebles: ReadonlyArray<MueblePreset>;
}

// ─── Catálogo de presets ────────────────────────────────────────────────────

/**
 * Preset 2026-05-14. Mesa horizontal con monitor encima. Sin silla — el
 * avatar interactúa parado frente a la mesa. Offsets calibrados contra la
 * mesa+monitor manualmente alineada en el espacio de referencia.
 */
export const PRESET_DESK_STANDARD: PresetDesk = Object.freeze({
  id: 'standard',
  nombre: 'Escritorio estándar',
  bbox: Object.freeze({ ancho: 4.5, alto: 4.0 }),
  muebles: Object.freeze([
    {
      rol: 'mesa',
      slugCatalogo: 'small_table_normalized',
      offsetX: 0,
      offsetY: 0.375,
      offsetZ: 0,
      rotacionY: Math.PI / 2,
    },
    {
      rol: 'monitor',
      slugCatalogo: 'computer_screen_normalized',
      offsetX: -0.53,
      offsetY: 0.74,
      offsetZ: 0.18,
      rotacionY: Math.PI,
    },
  ]) as ReadonlyArray<MueblePreset>,
});

/** Mapa para lookup por id (en caso futuro de múltiples presets). */
export const PRESETS_DESK: Readonly<Record<string, PresetDesk>> = Object.freeze({
  standard: PRESET_DESK_STANDARD,
});

/**
 * Resuelve un preset por id, con fallback al standard si el id no existe
 * (defensivo — para data legacy o input inválido).
 */
export function obtenerPresetDesk(id: string | null | undefined): PresetDesk {
  if (id && id in PRESETS_DESK) return PRESETS_DESK[id];
  return PRESET_DESK_STANDARD;
}
