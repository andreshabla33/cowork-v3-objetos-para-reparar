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
export type RolMueblePreset = 'silla' | 'mesa' | 'monitor';

// ─── Componente del preset (1 mueble) ───────────────────────────────────────

/**
 * Un mueble del preset. Coordenadas relativas al CENTRO del bbox del desk.
 * Por convención del Domain, +Z = hacia el "fondo" del desk (donde va el
 * monitor); -Z = hacia la "silla". Rotación en radianes alrededor de Y.
 */
export interface MueblePreset {
  readonly rol: RolMueblePreset;
  /** Slug del catálogo (`catalogo_objetos_3d.slug` / `nombre`). */
  readonly slugCatalogo: string;
  readonly offsetX: number;
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
 * Preset único 2026-05-13. Tamaño confirmado por el usuario: 4.5×4.0m.
 *
 * Layout del desk (top-down, mirando desde arriba):
 *
 *   ┌─────────────────┐  ← parte trasera (z+)
 *   │     [monitor]    │
 *   │       [mesa]     │
 *   │       [silla]    │  ← parte frontal (z-)
 *   └─────────────────┘
 *
 * Los offsets están normalizados al ancho/alto del bbox para que si más
 * adelante se agregan presets de otros tamaños la distribución relativa se
 * mantenga visualmente coherente.
 */
export const PRESET_DESK_STANDARD: PresetDesk = Object.freeze({
  id: 'standard',
  nombre: 'Escritorio estándar',
  bbox: Object.freeze({ ancho: 4.5, alto: 4.0 }),
  muebles: Object.freeze([
    // Mesa en el centro (slug real del catálogo público).
    {
      rol: 'mesa',
      slugCatalogo: 'small_table_normalized',
      offsetX: 0,
      offsetZ: 0,
      rotacionY: 0,
    },
    // Silla "delante" de la mesa (hacia -Z, donde se sienta el avatar).
    {
      rol: 'silla',
      slugCatalogo: 'office_chair_normalized',
      offsetX: 0,
      offsetZ: -1.0,
      rotacionY: Math.PI, // mirando al monitor
    },
    // Monitor "detrás" de la mesa (hacia +Z).
    {
      rol: 'monitor',
      slugCatalogo: 'computer_screen_normalized',
      offsetX: 0,
      offsetZ: 0.7,
      rotacionY: 0, // pantalla mirando al avatar (hacia -Z)
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
