import { FloorType } from './index';

export type PlantillaEspacioId = 'startup' | 'agencia' | 'corporativo';

export interface BloquePreviewPlantilla {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color: string;
  opacidad?: number;
  redondeado?: boolean;
}

export interface ObjetoPlantillaEspacio {
  clave: string;
  slug_catalogo: string;
  offset_x: number;
  offset_z: number;
  rotacion_y?: number;
  escala_x?: number;
  escala_y?: number;
  escala_z?: number;
}

export interface PlantillaEspacio {
  id: PlantillaEspacioId;
  nombre: string;
  descripcion: string;
  resumen: string[];
  color_primario: string;
  color_secundario: string;
  tipo_suelo: FloorType;
  zona: {
    ancho_metros: number;
    alto_metros: number;
    color: string;
  };
  preview: {
    bloques: BloquePreviewPlantilla[];
  };
  objetos: ObjetoPlantillaEspacio[];
}

export interface ContextoRecomendacionPlantillaEspacio {
  industria?: string | null;
  tamano?: string | null;
}

const PLANTILLAS: Record<PlantillaEspacioId, PlantillaEspacio> = {
  startup: {
    id: 'startup',
    nombre: 'Startup',
    descripcion: 'Open office compacto para equipos pequeños con colaboración rápida.',
    resumen: ['2 escritorios', 'Sofá de reunión', 'Mamparas de vidrio'],
    color_primario: '#8b5cf6',
    color_secundario: '#22d3ee',
    tipo_suelo: FloorType.CONCRETE_SMOOTH,
    zona: {
      ancho_metros: 12,
      alto_metros: 10,
      color: '#8b5cf6',
    },
    preview: {
      bloques: [
        { x: 8, y: 8, ancho: 84, alto: 84, color: 'rgba(139,92,246,0.14)', redondeado: true },
        { x: 18, y: 18, ancho: 24, alto: 12, color: 'rgba(255,255,255,0.65)' },
        { x: 58, y: 18, ancho: 24, alto: 12, color: 'rgba(255,255,255,0.65)' },
        { x: 24, y: 58, ancho: 18, alto: 14, color: 'rgba(34,211,238,0.55)', redondeado: true },
        { x: 48, y: 58, ancho: 24, alto: 10, color: 'rgba(34,211,238,0.45)', redondeado: true },
        { x: 16, y: 42, ancho: 8, alto: 36, color: 'rgba(191,219,254,0.45)' },
        { x: 76, y: 42, ancho: 8, alto: 36, color: 'rgba(191,219,254,0.45)' },
      ],
    },
    objetos: [
      { clave: 'muro_norte_1', slug_catalogo: 'pared_doble_ventana', offset_x: -3, offset_z: -4.7 },
      { clave: 'muro_norte_2', slug_catalogo: 'pared_doble_ventana', offset_x: 3, offset_z: -4.7 },
      { clave: 'muro_sur', slug_catalogo: 'pared_puerta_doble', offset_x: 0, offset_z: 4.7, rotacion_y: Math.PI },
      { clave: 'muro_oeste_1', slug_catalogo: 'pared_vidrio', offset_x: -5.7, offset_z: -2, rotacion_y: Math.PI / 2 },
      { clave: 'muro_oeste_2', slug_catalogo: 'pared_vidrio', offset_x: -5.7, offset_z: 2, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_1', slug_catalogo: 'pared_vidrio', offset_x: 5.7, offset_z: -2, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_2', slug_catalogo: 'pared_vidrio', offset_x: 5.7, offset_z: 2, rotacion_y: Math.PI / 2 },
      { clave: 'escritorio_1', slug_catalogo: 'desk', offset_x: -2.1, offset_z: -0.8, rotacion_y: Math.PI },
      { clave: 'escritorio_2', slug_catalogo: 'desk_1', offset_x: 2.1, offset_z: -0.8, rotacion_y: Math.PI },
      { clave: 'silla_1', slug_catalogo: 'office_chair', offset_x: -2.1, offset_z: 0.4 },
      { clave: 'silla_2', slug_catalogo: 'chair_1', offset_x: 2.1, offset_z: 0.4 },
      { clave: 'sofa', slug_catalogo: 'couch_small_1', offset_x: 0, offset_z: 2.7 },
      { clave: 'mesa', slug_catalogo: 'small_table', offset_x: 0, offset_z: 1.55 },
      { clave: 'planta_1', slug_catalogo: 'houseplant', offset_x: -4.4, offset_z: 3.3 },
      { clave: 'planta_2', slug_catalogo: 'flower_pot', offset_x: 4.4, offset_z: 3.3 },
    ],
  },
  agencia: {
    id: 'agencia',
    nombre: 'Agencia',
    descripcion: 'Distribución flexible con área social y estaciones para trabajo creativo.',
    resumen: ['4 puestos', 'Lounge colaborativo', 'Frente visual premium'],
    color_primario: '#06b6d4',
    color_secundario: '#10b981',
    tipo_suelo: FloorType.WOOD_OAK,
    zona: {
      ancho_metros: 14,
      alto_metros: 11,
      color: '#06b6d4',
    },
    preview: {
      bloques: [
        { x: 8, y: 8, ancho: 84, alto: 84, color: 'rgba(6,182,212,0.14)', redondeado: true },
        { x: 16, y: 18, ancho: 20, alto: 12, color: 'rgba(255,255,255,0.65)' },
        { x: 40, y: 18, ancho: 20, alto: 12, color: 'rgba(255,255,255,0.65)' },
        { x: 64, y: 18, ancho: 20, alto: 12, color: 'rgba(255,255,255,0.65)' },
        { x: 28, y: 56, ancho: 20, alto: 10, color: 'rgba(16,185,129,0.5)', redondeado: true },
        { x: 52, y: 56, ancho: 20, alto: 10, color: 'rgba(16,185,129,0.45)', redondeado: true },
        { x: 14, y: 36, ancho: 10, alto: 42, color: 'rgba(191,219,254,0.42)' },
        { x: 76, y: 36, ancho: 10, alto: 42, color: 'rgba(191,219,254,0.42)' },
      ],
    },
    objetos: [
      { clave: 'muro_norte_1', slug_catalogo: 'pared_paneles', offset_x: -5, offset_z: -5.2 },
      { clave: 'muro_norte_2', slug_catalogo: 'pared_doble_ventana', offset_x: 1, offset_z: -5.2 },
      { clave: 'muro_norte_3', slug_catalogo: 'pared_paneles', offset_x: 6, offset_z: -5.2, escala_x: 0.5 },
      { clave: 'muro_sur_1', slug_catalogo: 'pared_puerta_doble', offset_x: -2, offset_z: 5.2, rotacion_y: Math.PI },
      { clave: 'muro_sur_2', slug_catalogo: 'pared_basica', offset_x: 4, offset_z: 5.2, rotacion_y: Math.PI },
      { clave: 'muro_oeste_1', slug_catalogo: 'pared_vidrio', offset_x: -6.7, offset_z: -2.3, rotacion_y: Math.PI / 2 },
      { clave: 'muro_oeste_2', slug_catalogo: 'pared_vidrio', offset_x: -6.7, offset_z: 1.7, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_1', slug_catalogo: 'pared_vidrio', offset_x: 6.7, offset_z: -2.3, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_2', slug_catalogo: 'pared_vidrio', offset_x: 6.7, offset_z: 1.7, rotacion_y: Math.PI / 2 },
      { clave: 'escritorio_1', slug_catalogo: 'desk_3', offset_x: -3.6, offset_z: -1.1, rotacion_y: Math.PI },
      { clave: 'escritorio_2', slug_catalogo: 'desk_4', offset_x: -1.2, offset_z: -1.1, rotacion_y: Math.PI },
      { clave: 'escritorio_3', slug_catalogo: 'desk_5', offset_x: 1.2, offset_z: -1.1, rotacion_y: Math.PI },
      { clave: 'escritorio_4', slug_catalogo: 'desk_6', offset_x: 3.6, offset_z: -1.1, rotacion_y: Math.PI },
      { clave: 'silla_1', slug_catalogo: 'office_chair', offset_x: -3.6, offset_z: 0.25 },
      { clave: 'silla_2', slug_catalogo: 'office_chair_2', offset_x: -1.2, offset_z: 0.25 },
      { clave: 'silla_3', slug_catalogo: 'chair', offset_x: 1.2, offset_z: 0.25 },
      { clave: 'silla_4', slug_catalogo: 'chair_1', offset_x: 3.6, offset_z: 0.25 },
      { clave: 'sofa_1', slug_catalogo: 'couch', offset_x: -1.2, offset_z: 2.8, rotacion_y: Math.PI / 2 },
      { clave: 'sofa_2', slug_catalogo: 'couch_medium', offset_x: 1.4, offset_z: 2.8, rotacion_y: -Math.PI / 2 },
      { clave: 'mesa_centro', slug_catalogo: 'small_table', offset_x: 0.1, offset_z: 2.2 },
      { clave: 'planta_1', slug_catalogo: 'houseplant', offset_x: -5.1, offset_z: 4 },
      { clave: 'planta_2', slug_catalogo: 'flower_pot_1', offset_x: 5.1, offset_z: 4 },
      { clave: 'estante', slug_catalogo: 'shelf_small', offset_x: 5.4, offset_z: -2.7, rotacion_y: -Math.PI / 2 },
    ],
  },
  corporativo: {
    id: 'corporativo',
    nombre: 'Corporativo',
    descripcion: 'Oficina ejecutiva con sala formal, mamparas y recepción compacta.',
    resumen: ['Sala ejecutiva', '4 escritorios', 'Acabados sobrios'],
    color_primario: '#0f172a',
    color_secundario: '#f59e0b',
    tipo_suelo: FloorType.CARPET_OFFICE,
    zona: {
      ancho_metros: 16,
      alto_metros: 12,
      color: '#334155',
    },
    preview: {
      bloques: [
        { x: 8, y: 8, ancho: 84, alto: 84, color: 'rgba(15,23,42,0.22)', redondeado: true },
        { x: 18, y: 18, ancho: 22, alto: 12, color: 'rgba(255,255,255,0.7)' },
        { x: 44, y: 18, ancho: 22, alto: 12, color: 'rgba(255,255,255,0.7)' },
        { x: 70, y: 18, ancho: 14, alto: 12, color: 'rgba(255,255,255,0.7)' },
        { x: 24, y: 54, ancho: 20, alto: 12, color: 'rgba(245,158,11,0.55)', redondeado: true },
        { x: 50, y: 54, ancho: 26, alto: 12, color: 'rgba(245,158,11,0.35)', redondeado: true },
        { x: 14, y: 34, ancho: 10, alto: 46, color: 'rgba(191,219,254,0.32)' },
        { x: 76, y: 34, ancho: 10, alto: 46, color: 'rgba(191,219,254,0.32)' },
      ],
    },
    objetos: [
      { clave: 'muro_norte_1', slug_catalogo: 'pared_paneles', offset_x: -5, offset_z: -5.6 },
      { clave: 'muro_norte_2', slug_catalogo: 'pared_doble_ventana', offset_x: 1, offset_z: -5.6 },
      { clave: 'muro_norte_3', slug_catalogo: 'pared_paneles', offset_x: 7, offset_z: -5.6 },
      { clave: 'muro_sur_1', slug_catalogo: 'pared_paneles', offset_x: -5, offset_z: 5.6, rotacion_y: Math.PI },
      { clave: 'muro_sur_2', slug_catalogo: 'pared_puerta_doble', offset_x: 1, offset_z: 5.6, rotacion_y: Math.PI },
      { clave: 'muro_sur_3', slug_catalogo: 'pared_paneles', offset_x: 7, offset_z: 5.6, rotacion_y: Math.PI },
      { clave: 'muro_oeste_1', slug_catalogo: 'pared_vidrio', offset_x: -7.7, offset_z: -2.4, rotacion_y: Math.PI / 2 },
      { clave: 'muro_oeste_2', slug_catalogo: 'pared_vidrio', offset_x: -7.7, offset_z: 1.6, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_1', slug_catalogo: 'pared_vidrio', offset_x: 7.7, offset_z: -2.4, rotacion_y: Math.PI / 2 },
      { clave: 'muro_este_2', slug_catalogo: 'pared_vidrio', offset_x: 7.7, offset_z: 1.6, rotacion_y: Math.PI / 2 },
      { clave: 'mesa_reunion', slug_catalogo: 'table_large_circular', offset_x: 0.4, offset_z: 2.1 },
      { clave: 'sofa_1', slug_catalogo: 'couch_large', offset_x: -3.7, offset_z: 2.7, rotacion_y: Math.PI / 2 },
      { clave: 'sofa_2', slug_catalogo: 'l_couch', offset_x: 4.2, offset_z: 2.8, rotacion_y: -Math.PI / 2 },
      { clave: 'escritorio_1', slug_catalogo: 'adjustable_desk', offset_x: -4.2, offset_z: -1.3, rotacion_y: Math.PI },
      { clave: 'escritorio_2', slug_catalogo: 'desk', offset_x: -1.4, offset_z: -1.3, rotacion_y: Math.PI },
      { clave: 'escritorio_3', slug_catalogo: 'desk_3', offset_x: 1.4, offset_z: -1.3, rotacion_y: Math.PI },
      { clave: 'escritorio_4', slug_catalogo: 'desk_4', offset_x: 4.2, offset_z: -1.3, rotacion_y: Math.PI },
      { clave: 'silla_1', slug_catalogo: 'office_chair', offset_x: -4.2, offset_z: 0.2 },
      { clave: 'silla_2', slug_catalogo: 'office_chair_2', offset_x: -1.4, offset_z: 0.2 },
      { clave: 'silla_3', slug_catalogo: 'chair', offset_x: 1.4, offset_z: 0.2 },
      { clave: 'silla_4', slug_catalogo: 'desk_chair', offset_x: 4.2, offset_z: 0.2 },
      { clave: 'estante_1', slug_catalogo: 'shelf_small', offset_x: 6.3, offset_z: -3.2, rotacion_y: -Math.PI / 2 },
      { clave: 'planta_1', slug_catalogo: 'houseplant', offset_x: -6.1, offset_z: 4.2 },
      { clave: 'planta_2', slug_catalogo: 'flower_pot_1', offset_x: 6.1, offset_z: 4.2 },
    ],
  },
};

const normalizarValor = (valor?: string | null) => {
  return valor
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() ?? '';
};

const INDUSTRIAS_CREATIVAS = new Set([
  'marketing',
  'consultoria',
  'servicios',
  'comercio',
  'inmobiliaria',
]);

export const PLANTILLAS_ESPACIO = Object.values(PLANTILLAS);

export const esPlantillaEspacioId = (valor: string | null | undefined): valor is PlantillaEspacioId => {
  return typeof valor === 'string' && valor in PLANTILLAS;
};

export const obtenerPlantillaEspacio = (valor: string | null | undefined): PlantillaEspacio | null => {
  if (!esPlantillaEspacioId(valor)) {
    return null;
  }

  return PLANTILLAS[valor];
};

export const recomendarPlantillaEspacio = (contexto: ContextoRecomendacionPlantillaEspacio): PlantillaEspacio => {
  const tamano = normalizarValor(contexto.tamano);
  const industria = normalizarValor(contexto.industria);

  if (tamano === 'enterprise' || tamano === 'grande') {
    return PLANTILLAS.corporativo;
  }

  if (tamano === 'mediana' && industria && !INDUSTRIAS_CREATIVAS.has(industria)) {
    return PLANTILLAS.corporativo;
  }

  if (INDUSTRIAS_CREATIVAS.has(industria)) {
    return PLANTILLAS.agencia;
  }

  if (tamano === 'mediana') {
    return PLANTILLAS.agencia;
  }

  return PLANTILLAS.startup;
};
