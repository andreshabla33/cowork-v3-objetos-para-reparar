/**
 * @module core/domain/entities
 * Entidades de Dominio para el sistema de Pisos y Subsuelos del espacio 3D.
 * Clean Architecture: Esta capa NO depende de frameworks ni librerías externas.
 */

/**
 * ENUM de tipos de suelo disponibles.
 * Cada valor determina qué material PBR se aplicará al subsuelo en Three.js.
 */
export enum FloorType {
  /** Parquet de madera de roble con vetas naturales */
  WOOD_OAK = 'wood_oak',
  /** Madera oscura para ambientes ejecutivos */
  WOOD_DARK = 'wood_dark',
  /** Alfombra corporativa de tonos neutros */
  CARPET_OFFICE = 'carpet_office',
  /** Alfombra suave en gris claro */
  CARPET_SOFT_GRAY = 'carpet_soft_gray',
  /** Mármol blanco con venas grises */
  MARBLE_WHITE = 'marble_white',
  /** Mármol negro premium */
  MARBLE_BLACK = 'marble_black',
  /** Concreto industrial pulido */
  CONCRETE_SMOOTH = 'concrete_smooth',
  /** Concreto industrial en bruto */
  CONCRETE_ROUGH = 'concrete_rough',
  /** Rejilla metálica para subsuelos técnicos */
  METAL_GRID = 'metal_grid',
  /** Baldosas de cerámica blanca */
  TILE_WHITE = 'tile_white',
  /** Baldosas hexagonales */
  TILE_HEX = 'tile_hex',
  /** Linóleo técnico para subsuelos con equipamiento */
  VINYL_TECH = 'vinyl_tech',
}

/** Categorías de tipos de suelo para la UI */
export const FLOOR_TYPE_CATEGORIES: Record<string, FloorType[]> = {
  'Madera': [FloorType.WOOD_OAK, FloorType.WOOD_DARK],
  'Alfombra': [FloorType.CARPET_OFFICE, FloorType.CARPET_SOFT_GRAY],
  'Mármol': [FloorType.MARBLE_WHITE, FloorType.MARBLE_BLACK],
  'Concreto': [FloorType.CONCRETE_SMOOTH, FloorType.CONCRETE_ROUGH],
  'Especial': [FloorType.METAL_GRID, FloorType.TILE_WHITE, FloorType.TILE_HEX, FloorType.VINYL_TECH],
};

/** Etiquetas de display para cada tipo de suelo */
export const FLOOR_TYPE_LABELS: Record<FloorType, string> = {
  [FloorType.WOOD_OAK]: 'Madera Roble',
  [FloorType.WOOD_DARK]: 'Madera Oscura',
  [FloorType.CARPET_OFFICE]: 'Alfombra Corporativa',
  [FloorType.CARPET_SOFT_GRAY]: 'Alfombra Gris',
  [FloorType.MARBLE_WHITE]: 'Mármol Blanco',
  [FloorType.MARBLE_BLACK]: 'Mármol Negro',
  [FloorType.CONCRETE_SMOOTH]: 'Concreto Pulido',
  [FloorType.CONCRETE_ROUGH]: 'Concreto Industrial',
  [FloorType.METAL_GRID]: 'Rejilla Metálica',
  [FloorType.TILE_WHITE]: 'Baldosa Cerámica',
  [FloorType.TILE_HEX]: 'Baldosa Hexagonal',
  [FloorType.VINYL_TECH]: 'Vinilo Técnico',
};

 export const TIPOS_SUELO = Object.values(FloorType) as FloorType[];

 export function esTipoSueloValido(valor: string | null | undefined): valor is FloorType {
   return typeof valor === 'string' && TIPOS_SUELO.includes(valor as FloorType);
 }

 export function normalizarTipoSuelo(
   valor: string | null | undefined,
   tipoPorDefecto: FloorType = FloorType.CONCRETE_SMOOTH
 ): FloorType {
   if (esTipoSueloValido(valor)) return valor;

   if (typeof valor === 'string') {
     const valorNormalizado = valor.trim().toLowerCase();
     const coincidencia = TIPOS_SUELO.find((tipo) => tipo === valorNormalizado);
     if (coincidencia) return coincidencia;
   }

   return tipoPorDefecto;
 }

// ─── Entidades de Dominio ────────────────────────────────────────────────────

export interface Floor {
  id: string;
  spaceId: string;
  name: string;
  level: number;
}

export interface Subfloor {
  id: string;
  floorId: string;
  name: string;
  dimensions: { width: number; depth: number };
  position: { x: number; y: number; z: number };
  /** Tipo de suelo PBR (usa el ENUM FloorType) */
  floorType?: FloorType;
  appearance?: {
    /** Color legacy (solo se usa si no hay floorType) */
    color?: string;
    /** URL de textura override (avanzado) */
    textureUrl?: string;
    /** Opacidad del subsuelo (0–1). Útil para subsuelos técnicos. */
    opacity?: number;
  };
}
