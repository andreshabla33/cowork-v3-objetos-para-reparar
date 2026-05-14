/**
 * @module @cowork/core-shared
 *
 * Tipos y constantes compartibles entre la app 3D y la 2D. Demo del wiring
 * monorepo — en la migración real recibe los entities de Domain (FloorType,
 * AreaEscritorio, etc.) y los ports (IPisoDecorativoRepository, etc.).
 *
 * Clean Architecture: TS puro, cero deps externas.
 */

// ─── Subset del FloorType de v3.7 ───────────────────────────────────────────
// En migración real este enum vive acá y v3.7 lo importa de aquí.
export enum FloorType {
  WOOD_OAK = 'wood_oak',
  WOOD_DARK = 'wood_dark',
  CARPET_OFFICE = 'carpet_office',
  CONCRETE_SMOOTH = 'concrete_smooth',
  TILE_HEX = 'tile_hex',
  STONE_PATH_GARDEN = 'stone_path_garden',
}

/** Color hex usado para preview / swatch en UI. */
export const FLOOR_TYPE_COLORS: Record<FloorType, string> = {
  [FloorType.WOOD_OAK]: '#c19a6b',
  [FloorType.WOOD_DARK]: '#5a3a22',
  [FloorType.CARPET_OFFICE]: '#3b4a6b',
  [FloorType.CONCRETE_SMOOTH]: '#9aa0a6',
  [FloorType.TILE_HEX]: '#dadada',
  [FloorType.STONE_PATH_GARDEN]: '#8a7e5f',
};

// ─── Vector 2D (reemplaza Posicion3D en mundo 2D) ───────────────────────────

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export function distancia2D(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Rectángulo (para zonas, pisos decorativos) ────────────────────────────

export interface Rect {
  readonly centroX: number;
  readonly centroY: number;
  readonly ancho: number;
  readonly alto: number;
}

export function puntoDentroDeRect(p: Vector2D, r: Rect): boolean {
  return (
    p.x >= r.centroX - r.ancho / 2 &&
    p.x <= r.centroX + r.ancho / 2 &&
    p.y >= r.centroY - r.alto / 2 &&
    p.y <= r.centroY + r.alto / 2
  );
}
