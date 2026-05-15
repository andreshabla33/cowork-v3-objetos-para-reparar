import { FloorType, normalizarTipoSuelo } from './tiposSuelo';
import type { EstiloVisualArquitectonico } from './estilosVisualesArquitectonicos';
import type { TipoMaterialArquitectonico } from './objetosArquitectonicos';

export interface PerfilEsteticoParedPorSuelo {
  tipo_suelo: FloorType;
  estilo_visual: EstiloVisualArquitectonico;
  tipo_material: TipoMaterialArquitectonico;
  color_base: string;
  escala_textura: number;
  rugosidad: number;
  metalicidad: number;
}

const PERFILES_PARED_POR_SUELO: Record<FloorType, PerfilEsteticoParedPorSuelo> = {
  [FloorType.WOOD_OAK]: {
    tipo_suelo: FloorType.WOOD_OAK,
    estilo_visual: 'minimalista',
    tipo_material: 'madera',
    color_base: '#cfa974',
    escala_textura: 1.1,
    rugosidad: 0.58,
    metalicidad: 0.04,
  },
  [FloorType.WOOD_DARK]: {
    tipo_suelo: FloorType.WOOD_DARK,
    estilo_visual: 'corporativo',
    tipo_material: 'madera',
    color_base: '#6a4b31',
    escala_textura: 1.05,
    rugosidad: 0.56,
    metalicidad: 0.05,
  },
  [FloorType.CARPET_OFFICE]: {
    tipo_suelo: FloorType.CARPET_OFFICE,
    estilo_visual: 'corporativo',
    tipo_material: 'yeso',
    color_base: '#e5e7eb',
    escala_textura: 1.35,
    rugosidad: 0.88,
    metalicidad: 0.01,
  },
  [FloorType.CARPET_SOFT_GRAY]: {
    tipo_suelo: FloorType.CARPET_SOFT_GRAY,
    estilo_visual: 'minimalista',
    tipo_material: 'yeso',
    color_base: '#f1f3f5',
    escala_textura: 1.4,
    rugosidad: 0.9,
    metalicidad: 0.01,
  },
  [FloorType.MARBLE_WHITE]: {
    tipo_suelo: FloorType.MARBLE_WHITE,
    estilo_visual: 'minimalista',
    tipo_material: 'yeso',
    color_base: '#f3f1eb',
    escala_textura: 1.7,
    rugosidad: 0.42,
    metalicidad: 0.03,
  },
  [FloorType.MARBLE_BLACK]: {
    tipo_suelo: FloorType.MARBLE_BLACK,
    estilo_visual: 'industrial',
    tipo_material: 'concreto',
    color_base: '#2a2d33',
    escala_textura: 1.5,
    rugosidad: 0.46,
    metalicidad: 0.08,
  },
  [FloorType.CONCRETE_SMOOTH]: {
    tipo_suelo: FloorType.CONCRETE_SMOOTH,
    estilo_visual: 'minimalista',
    tipo_material: 'concreto',
    color_base: '#aab1b8',
    escala_textura: 1.45,
    rugosidad: 0.82,
    metalicidad: 0.01,
  },
  [FloorType.CONCRETE_ROUGH]: {
    tipo_suelo: FloorType.CONCRETE_ROUGH,
    estilo_visual: 'industrial',
    tipo_material: 'concreto',
    color_base: '#7b828a',
    escala_textura: 1.2,
    rugosidad: 0.92,
    metalicidad: 0.01,
  },
  [FloorType.METAL_GRID]: {
    tipo_suelo: FloorType.METAL_GRID,
    estilo_visual: 'industrial',
    tipo_material: 'metal',
    color_base: '#6b7280',
    escala_textura: 1,
    rugosidad: 0.3,
    metalicidad: 0.85,
  },
  [FloorType.TILE_WHITE]: {
    tipo_suelo: FloorType.TILE_WHITE,
    estilo_visual: 'corporativo',
    tipo_material: 'yeso',
    color_base: '#f7f7f2',
    escala_textura: 1.55,
    rugosidad: 0.5,
    metalicidad: 0.02,
  },
  [FloorType.TILE_HEX]: {
    tipo_suelo: FloorType.TILE_HEX,
    estilo_visual: 'corporativo',
    tipo_material: 'yeso',
    color_base: '#e4e7eb',
    escala_textura: 1.5,
    rugosidad: 0.58,
    metalicidad: 0.02,
  },
  [FloorType.VINYL_TECH]: {
    tipo_suelo: FloorType.VINYL_TECH,
    estilo_visual: 'corporativo',
    tipo_material: 'concreto',
    color_base: '#566373',
    escala_textura: 1.2,
    rugosidad: 0.72,
    metalicidad: 0.06,
  },
  [FloorType.WOOD_PLANKS_GREEN]: {
    tipo_suelo: FloorType.WOOD_PLANKS_GREEN,
    estilo_visual: 'corporativo',
    tipo_material: 'madera',
    color_base: '#c5d6a3',
    escala_textura: 1.1,
    rugosidad: 0.7,
    metalicidad: 0.02,
  },
  [FloorType.WOOD_PLANKS_TEAL]: {
    tipo_suelo: FloorType.WOOD_PLANKS_TEAL,
    estilo_visual: 'corporativo',
    tipo_material: 'madera',
    color_base: '#a8c8d6',
    escala_textura: 1.1,
    rugosidad: 0.7,
    metalicidad: 0.02,
  },
  [FloorType.WOOD_PLANKS_MUSTARD]: {
    tipo_suelo: FloorType.WOOD_PLANKS_MUSTARD,
    estilo_visual: 'corporativo',
    tipo_material: 'madera',
    color_base: '#e6cf86',
    escala_textura: 1.1,
    rugosidad: 0.7,
    metalicidad: 0.02,
  },
  [FloorType.WOOD_CHEVRON_BURGUNDY]: {
    tipo_suelo: FloorType.WOOD_CHEVRON_BURGUNDY,
    estilo_visual: 'minimalista',
    tipo_material: 'madera',
    color_base: '#d4a3b8',
    escala_textura: 1.2,
    rugosidad: 0.78,
    metalicidad: 0.02,
  },
  [FloorType.HEX_STYLIZED]: {
    tipo_suelo: FloorType.HEX_STYLIZED,
    estilo_visual: 'minimalista',
    tipo_material: 'yeso',
    color_base: '#cbd1d6',
    escala_textura: 1.5,
    rugosidad: 0.75,
    metalicidad: 0.02,
  },
  [FloorType.STONE_COBBLE_WARM]: {
    tipo_suelo: FloorType.STONE_COBBLE_WARM,
    estilo_visual: 'industrial',
    tipo_material: 'concreto',
    color_base: '#c9a779',
    escala_textura: 1.3,
    rugosidad: 0.85,
    metalicidad: 0.01,
  },
  [FloorType.STONE_PATH_GARDEN]: {
    tipo_suelo: FloorType.STONE_PATH_GARDEN,
    estilo_visual: 'minimalista',
    tipo_material: 'concreto',
    color_base: '#a8c2a3',
    escala_textura: 1.25,
    rugosidad: 0.88,
    metalicidad: 0.01,
  },
  [FloorType.STONE_STYLIZED_WARM]: {
    tipo_suelo: FloorType.STONE_STYLIZED_WARM,
    estilo_visual: 'minimalista',
    tipo_material: 'concreto',
    color_base: '#cc7848',
    escala_textura: 1.1,
    rugosidad: 0.85,
    metalicidad: 0.0,
  },
};

export const resolverPerfilEsteticoParedPorSuelo = (tipoSuelo: string | null | undefined): PerfilEsteticoParedPorSuelo => {
  const tipoSueloNormalizado = normalizarTipoSuelo(tipoSuelo, FloorType.CONCRETE_SMOOTH);
  return PERFILES_PARED_POR_SUELO[tipoSueloNormalizado];
};
