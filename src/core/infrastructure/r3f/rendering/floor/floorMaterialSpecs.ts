/**
 * @module infrastructure/r3f/rendering/floor/floorMaterialSpecs
 *
 * Catálogo declarativo: FloorType → spec del material GPU-procedural.
 *
 * Cada spec define qué pattern GLSL renderizar, qué paleta usar, y los
 * parámetros PBR (roughness, metalness). Modificar texturas o añadir un
 * suelo nuevo = una entrada en este archivo + opcionalmente un nuevo
 * pattern en `floorShaderLib.glsl.ts`.
 *
 * Familias de pattern soportadas (compile-time via `#define`):
 *   PLANKS, CHEVRON, MARBLE, CONCRETE, CARPET, HEX, COBBLE
 *
 * @see floorShaderLib.glsl.ts
 * @see FloorMaterialAdapter.ts
 */

import { FloorType } from '@/core/domain/entities';

export type FloorPattern =
  | 'PLANKS'
  | 'CHEVRON'
  | 'MARBLE'
  | 'CONCRETE'
  | 'CARPET'
  | 'HEX'
  | 'COBBLE';

export interface FloorSpec {
  /** Familia GLSL — determina el `#define FLOOR_PATTERN_*` */
  pattern: FloorPattern;
  /** 4 tonos RGB en hex (lineal-srgb) — el shader los lee como uPalette[0..3] */
  palette: readonly [string, string, string, string];
  /** Sub-variante usada por algunos patterns (0,1,2…) */
  variant: number;
  /** Metros de mundo por ciclo de patrón (uTileSize del shader) */
  tileSize: number;
  /** PBR roughness (0 = espejo, 1 = mate total) */
  roughness: number;
  /** PBR metalness (0 = dieléctrico, 1 = metal puro) */
  metalness: number;
  /** Color emisivo (hex), si aplica */
  emissive?: string;
  /** Intensidad emisiva (0–1) */
  emissiveIntensity?: number;
  /** Opacidad base (1 = sólido) */
  opacity: number;
  /** Color representativo para UI swatches (selectores de suelo) */
  swatchColor: string;
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const FLOOR_SPECS: Record<FloorType, FloorSpec> = {
  // ── PLANKS ───────────────────────────────────────────────────────────────
  [FloorType.WOOD_OAK]: {
    pattern: 'PLANKS',
    palette: ['#c8a96e', '#b8944f', '#d4b077', '#3a2410'],
    variant: 0,
    tileSize: 0.7,
    roughness: 0.65,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#c8a96e',
  },
  [FloorType.WOOD_DARK]: {
    pattern: 'PLANKS',
    palette: ['#4a3322', '#3d2b1a', '#5a4030', '#1a0e05'],
    variant: 0,
    tileSize: 0.7,
    roughness: 0.55,
    metalness: 0.05,
    opacity: 1,
    swatchColor: '#3d2b1a',
  },
  [FloorType.WOOD_PLANKS_GREEN]: {
    pattern: 'PLANKS',
    palette: ['#86b855', '#6da043', '#98c668', '#2e4218'],
    variant: 0,
    tileSize: 0.5,
    roughness: 0.75,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#86b855',
  },
  [FloorType.WOOD_PLANKS_TEAL]: {
    pattern: 'PLANKS',
    palette: ['#3a8fae', '#2d7896', '#4ba3c2', '#1a4252'],
    variant: 0,
    tileSize: 0.5,
    roughness: 0.75,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#3a8fae',
  },
  [FloorType.WOOD_PLANKS_MUSTARD]: {
    pattern: 'PLANKS',
    palette: ['#d4a236', '#c2902a', '#e6b350', '#5c4014'],
    variant: 0,
    tileSize: 0.5,
    roughness: 0.75,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#d4a236',
  },

  // ── CHEVRON ──────────────────────────────────────────────────────────────
  [FloorType.WOOD_CHEVRON_BURGUNDY]: {
    pattern: 'CHEVRON',
    palette: ['#6f1f3f', '#8e2f55', '#b54478', '#3a0e1f'],
    variant: 0,
    tileSize: 0.22,
    roughness: 0.85,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#8e2f55',
  },

  // ── MARBLE ───────────────────────────────────────────────────────────────
  [FloorType.MARBLE_WHITE]: {
    pattern: 'MARBLE',
    palette: ['#f0eee8', '#d8d4c8', '#a09888', '#1a1a1f'],
    variant: 0,
    tileSize: 1.2,
    roughness: 0.15,
    metalness: 0.03,
    opacity: 1,
    swatchColor: '#f0eee8',
  },
  [FloorType.MARBLE_BLACK]: {
    pattern: 'MARBLE',
    palette: ['#1a1a1f', '#2a2a30', '#9a9aa0', '#d4af37'],
    variant: 1,
    tileSize: 1.2,
    roughness: 0.10,
    metalness: 0.08,
    opacity: 1,
    swatchColor: '#1a1a1f',
  },

  // ── CONCRETE ─────────────────────────────────────────────────────────────
  [FloorType.CONCRETE_SMOOTH]: {
    pattern: 'CONCRETE',
    palette: ['#8a8f96', '#9aa0a7', '#6a6e74', '#404045'],
    variant: 0,
    tileSize: 1.5,
    roughness: 0.75,
    metalness: 0.01,
    opacity: 1,
    swatchColor: '#8a8f96',
  },
  [FloorType.CONCRETE_ROUGH]: {
    pattern: 'CONCRETE',
    palette: ['#6b7280', '#7a8088', '#555a62', '#2a2c30'],
    variant: 1,
    tileSize: 1.1,
    roughness: 0.92,
    metalness: 0.01,
    opacity: 1,
    swatchColor: '#6b7280',
  },

  // ── CARPET ───────────────────────────────────────────────────────────────
  [FloorType.CARPET_OFFICE]: {
    pattern: 'CARPET',
    palette: ['#4a5568', '#5a6578', '#3a4555', '#8899bb'],
    variant: 0,
    tileSize: 0.55,
    roughness: 0.95,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#4a5568',
  },
  [FloorType.CARPET_SOFT_GRAY]: {
    pattern: 'CARPET',
    palette: ['#9ca3af', '#aab0b8', '#888e95', '#cbd0d6'],
    variant: 1,
    tileSize: 0.55,
    roughness: 0.98,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#9ca3af',
  },

  // ── HEX ──────────────────────────────────────────────────────────────────
  [FloorType.TILE_HEX]: {
    pattern: 'HEX',
    palette: ['#d1d5db', '#e0e4ea', '#ffffff', '#9aa0a7'],
    variant: 0,
    tileSize: 0.35,
    roughness: 0.30,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#d1d5db',
  },
  [FloorType.HEX_STYLIZED]: {
    pattern: 'HEX',
    palette: ['#7a7a82', '#c14a3a', '#ffffff', '#2a2a30'],
    variant: 1,
    tileSize: 0.30,
    roughness: 0.85,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#c14a3a',
  },
  [FloorType.METAL_GRID]: {
    pattern: 'HEX',
    palette: ['#1e2128', '#2a2e38', '#4a7fa8', '#0a0c10'],
    variant: 2,
    tileSize: 0.25,
    roughness: 0.35,
    metalness: 0.85,
    emissive: '#4a7fa8',
    emissiveIntensity: 0.06,
    opacity: 1,
    swatchColor: '#4a7fa8',
  },

  // ── PLANKS (square tile / checker variants) ──────────────────────────────
  [FloorType.TILE_WHITE]: {
    pattern: 'PLANKS',
    palette: ['#f4f4f0', '#e8e8e4', '#fafaf6', '#c8ccd0'],
    variant: 1, // square tile
    tileSize: 0.7,
    roughness: 0.25,
    metalness: 0.02,
    opacity: 1,
    swatchColor: '#f4f4f0',
  },
  [FloorType.VINYL_TECH]: {
    pattern: 'PLANKS',
    palette: ['#2d3748', '#3d4a5c', '#64b5f6', '#1a1f2a'],
    variant: 2, // small checker
    tileSize: 0.7,
    roughness: 0.70,
    metalness: 0.06,
    emissive: '#3b82f6',
    emissiveIntensity: 0.04,
    opacity: 1,
    swatchColor: '#2d3748',
  },

  // ── COBBLE ───────────────────────────────────────────────────────────────
  [FloorType.STONE_COBBLE_WARM]: {
    pattern: 'COBBLE',
    palette: ['#e8d8a0', '#d4a370', '#b87850', '#3a2818'],
    variant: 0,
    tileSize: 0.55,
    roughness: 0.90,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#d4a370',
  },
  [FloorType.STONE_PATH_GARDEN]: {
    // [0] stone base, [1] stone alt, [2] tuft (verde-oscuro), [3] grass grout (verde medio)
    pattern: 'COBBLE',
    palette: ['#a06850', '#8a5540', '#2e5510', '#4a8520'],
    variant: 1, // grass grout
    tileSize: 0.6,
    roughness: 0.92,
    metalness: 0.0,
    opacity: 1,
    swatchColor: '#a06850',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Familia GLSL como string para `customProgramCacheKey` */
export function programCacheKey(spec: FloorSpec): string {
  return `floor:${spec.pattern}:v${spec.variant}`;
}
