export enum FloorType {
  WOOD_OAK = 'wood_oak',
  WOOD_DARK = 'wood_dark',
  CARPET_OFFICE = 'carpet_office',
  CARPET_SOFT_GRAY = 'carpet_soft_gray',
  MARBLE_WHITE = 'marble_white',
  MARBLE_BLACK = 'marble_black',
  CONCRETE_SMOOTH = 'concrete_smooth',
  CONCRETE_ROUGH = 'concrete_rough',
  METAL_GRID = 'metal_grid',
  TILE_WHITE = 'tile_white',
  TILE_HEX = 'tile_hex',
  VINYL_TECH = 'vinyl_tech',
}

export const FLOOR_TYPE_CATEGORIES: Record<string, FloorType[]> = {
  'Madera': [FloorType.WOOD_OAK, FloorType.WOOD_DARK],
  'Alfombra': [FloorType.CARPET_OFFICE, FloorType.CARPET_SOFT_GRAY],
  'Mármol': [FloorType.MARBLE_WHITE, FloorType.MARBLE_BLACK],
  'Concreto': [FloorType.CONCRETE_SMOOTH, FloorType.CONCRETE_ROUGH],
  'Especial': [FloorType.METAL_GRID, FloorType.TILE_WHITE, FloorType.TILE_HEX, FloorType.VINYL_TECH],
};

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
