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
  offset_y?: number;
  sobre_clave?: string;
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

export type PlantillaZonaId = 'cubiculo' | 'sala_juntas' | 'focus' | 'comedor' | 'bano' | 'sala_meeting_grande' | 'piso_base';

export interface SubzonaDecorativaPlantillaZona {
  clave: string;
  nombre: string;
  offset_x: number;
  offset_z: number;
  ancho_metros: number;
  alto_metros: number;
  tipo_suelo: FloorType;
  color: string;
}

export interface ReglasPlantillaZona {
  editable_por_miembro: boolean;
  permite_agregar_objetos: boolean;
  permite_mover_objetos: boolean;
}

export interface PlantillaZona {
  id: PlantillaZonaId;
  version: number;
  nombre: string;
  descripcion: string;
  resumen: string[];
  color_primario: string;
  color_secundario: string;
  ancho_minimo_metros: number;
  alto_minimo_metros: number;
  tipo_suelo: FloorType;
  preview: {
    bloques: BloquePreviewPlantilla[];
  };
  subzonas: SubzonaDecorativaPlantillaZona[];
  objetos: ObjetoPlantillaEspacio[];
  reglas: ReglasPlantillaZona;
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

const PLANTILLAS_ZONA: Record<PlantillaZonaId, PlantillaZona> = {
  cubiculo: {
    id: 'cubiculo',
    version: 1,
    nombre: 'Cubículo',
    descripcion: 'Puesto individual con privacidad ligera, escritorio, silla y PC.',
    resumen: ['1 puesto personal', 'PC fija', 'Subsuelo decorativo'],
    color_primario: '#4f46e5',
    color_secundario: '#14b8a6',
    ancho_minimo_metros: 4,
    alto_minimo_metros: 4,
    tipo_suelo: FloorType.CARPET_SOFT_GRAY,
    preview: {
      bloques: [
        { x: 10, y: 10, ancho: 80, alto: 80, color: 'rgba(79,70,229,0.14)', redondeado: true },
        { x: 26, y: 18, ancho: 48, alto: 40, color: 'rgba(255,255,255,0.72)' },
        { x: 20, y: 62, ancho: 60, alto: 12, color: 'rgba(20,184,166,0.35)', redondeado: true },
        { x: 18, y: 18, ancho: 8, alto: 56, color: 'rgba(191,219,254,0.45)' },
        { x: 74, y: 18, ancho: 8, alto: 56, color: 'rgba(191,219,254,0.45)' },
      ],
    },
    subzonas: [
      { clave: 'area_trabajo', nombre: 'Área de trabajo', offset_x: 0, offset_z: 0.05, ancho_metros: 2.35, alto_metros: 1.8, tipo_suelo: FloorType.WOOD_OAK, color: '#ffffff' },
      { clave: 'franja_acceso', nombre: 'Acceso', offset_x: 0, offset_z: 1.15, ancho_metros: 1.4, alto_metros: 0.45, tipo_suelo: FloorType.MARBLE_WHITE, color: '#ffffff' },
    ],
    objetos: [
      { clave: 'muro_norte', slug_catalogo: 'pared_paneles', offset_x: 0, offset_z: -1.45, escala_x: 0.62 },
      { clave: 'muro_sur_izquierdo', slug_catalogo: 'pared_paneles', offset_x: -1.05, offset_z: 1.45, rotacion_y: Math.PI, escala_x: 0.24 },
      { clave: 'muro_sur_derecho', slug_catalogo: 'pared_paneles', offset_x: 1.05, offset_z: 1.45, rotacion_y: Math.PI, escala_x: 0.24 },
      { clave: 'muro_oeste', slug_catalogo: 'pared_vidrio', offset_x: -1.38, offset_z: -0.05, rotacion_y: Math.PI / 2, escala_x: 0.72 },
      { clave: 'muro_este', slug_catalogo: 'pared_vidrio', offset_x: 1.38, offset_z: -0.05, rotacion_y: Math.PI / 2, escala_x: 0.72 },
      { clave: 'escritorio', slug_catalogo: 'desk', offset_x: 0, offset_z: -0.35, rotacion_y: Math.PI },
      { clave: 'silla', slug_catalogo: 'office_chair', offset_x: 0, offset_z: 0.72 },
      { clave: 'pc', slug_catalogo: 'computer_screen', offset_x: 0, offset_z: -0.72, rotacion_y: Math.PI },
      { clave: 'teclado', slug_catalogo: 'keyboard', offset_x: 0, offset_z: -0.5, rotacion_y: Math.PI },
      { clave: 'planta', slug_catalogo: 'flower_pot', offset_x: 1.05, offset_z: 0.88 },
    ],
    reglas: {
      editable_por_miembro: true,
      permite_agregar_objetos: true,
      permite_mover_objetos: true,
    },
  },
  sala_juntas: {
    id: 'sala_juntas',
    version: 1,
    nombre: 'Sala de juntas',
    descripcion: 'Sala colaborativa con mesa central, sillas y cerramiento de vidrio.',
    resumen: ['Mesa central', '4 sillas', 'Área colaborativa'],
    color_primario: '#0f766e',
    color_secundario: '#22c55e',
    ancho_minimo_metros: 6,
    alto_minimo_metros: 5,
    tipo_suelo: FloorType.WOOD_DARK,
    preview: {
      bloques: [
        { x: 8, y: 8, ancho: 84, alto: 84, color: 'rgba(15,118,110,0.18)', redondeado: true },
        { x: 22, y: 22, ancho: 56, alto: 38, color: 'rgba(255,255,255,0.72)', redondeado: true },
        { x: 28, y: 64, ancho: 44, alto: 10, color: 'rgba(34,197,94,0.32)', redondeado: true },
        { x: 18, y: 18, ancho: 8, alto: 58, color: 'rgba(191,219,254,0.4)' },
        { x: 74, y: 18, ancho: 8, alto: 58, color: 'rgba(191,219,254,0.4)' },
      ],
    },
    subzonas: [
      { clave: 'alfombra_central', nombre: 'Núcleo de reunión', offset_x: 0, offset_z: 0.1, ancho_metros: 3.4, alto_metros: 2.2, tipo_suelo: FloorType.CARPET_OFFICE, color: '#ffffff' },
      { clave: 'franja_presentacion', nombre: 'Frente de presentación', offset_x: 0, offset_z: -1.3, ancho_metros: 2.4, alto_metros: 0.55, tipo_suelo: FloorType.MARBLE_BLACK, color: '#ffffff' },
    ],
    objetos: [
      { clave: 'muro_norte', slug_catalogo: 'pared_doble_ventana', offset_x: 0, offset_z: -2.45 },
      { clave: 'muro_sur', slug_catalogo: 'pared_puerta_doble', offset_x: 0, offset_z: 2.45, rotacion_y: Math.PI },
      { clave: 'muro_oeste', slug_catalogo: 'pared_vidrio', offset_x: -2.95, offset_z: 0, rotacion_y: Math.PI / 2, escala_x: 0.72 },
      { clave: 'muro_este', slug_catalogo: 'pared_vidrio', offset_x: 2.95, offset_z: 0, rotacion_y: Math.PI / 2, escala_x: 0.72 },
      { clave: 'mesa', slug_catalogo: 'table_large_circular', offset_x: 0, offset_z: 0.15 },
      { clave: 'silla_norte', slug_catalogo: 'office_chair', offset_x: 0, offset_z: -1.1, rotacion_y: 0 },
      { clave: 'silla_sur', slug_catalogo: 'office_chair_2', offset_x: 0, offset_z: 1.3, rotacion_y: Math.PI },
      { clave: 'silla_oeste', slug_catalogo: 'chair', offset_x: -1.55, offset_z: 0.15, rotacion_y: Math.PI / 2 },
      { clave: 'silla_este', slug_catalogo: 'chair_1', offset_x: 1.55, offset_z: 0.15, rotacion_y: -Math.PI / 2 },
      { clave: 'mesa_tv', slug_catalogo: 'small_table', offset_x: 0, offset_z: -1.85, rotacion_y: Math.PI, escala_x: 0.9, escala_z: 0.55 },
      { clave: 'pantalla', slug_catalogo: 'tv', offset_x: 0, offset_z: -1.85, offset_y: 0.04, sobre_clave: 'mesa_tv', rotacion_y: Math.PI },
      { clave: 'mesa_cafetera', slug_catalogo: 'small_table', offset_x: 2.05, offset_z: 1.55, rotacion_y: -Math.PI / 2, escala_x: 0.7, escala_z: 0.7 },
      { clave: 'cafetera', slug_catalogo: 'coffee_machine', offset_x: 2.05, offset_z: 1.55, offset_y: 0.05, sobre_clave: 'mesa_cafetera', rotacion_y: -Math.PI / 2, escala_x: 0.42, escala_y: 0.42, escala_z: 0.42 },
    ],
    reglas: {
      editable_por_miembro: false,
      permite_agregar_objetos: false,
      permite_mover_objetos: false,
    },
  },
  focus: {
    id: 'focus',
    version: 1,
    nombre: 'Focus room',
    descripcion: 'Espacio de concentración con aislamiento visual, escritorio compacto y asiento dedicado.',
    resumen: ['1 asiento', 'PC o laptop', 'Privacidad alta'],
    color_primario: '#334155',
    color_secundario: '#a855f7',
    ancho_minimo_metros: 3.5,
    alto_minimo_metros: 4,
    tipo_suelo: FloorType.CARPET_OFFICE,
    preview: {
      bloques: [
        { x: 10, y: 10, ancho: 80, alto: 80, color: 'rgba(51,65,85,0.2)', redondeado: true },
        { x: 24, y: 18, ancho: 52, alto: 46, color: 'rgba(255,255,255,0.75)' },
        { x: 28, y: 68, ancho: 44, alto: 8, color: 'rgba(168,85,247,0.34)', redondeado: true },
      ],
    },
    subzonas: [
      { clave: 'alfombra_trabajo', nombre: 'Alfombra acústica', offset_x: 0, offset_z: -0.05, ancho_metros: 2.2, alto_metros: 1.7, tipo_suelo: FloorType.CARPET_SOFT_GRAY, color: '#ffffff' },
      { clave: 'franja_led', nombre: 'Franja guía', offset_x: 0, offset_z: 1.02, ancho_metros: 1.1, alto_metros: 0.32, tipo_suelo: FloorType.VINYL_TECH, color: '#ffffff' },
    ],
    objetos: [
      { clave: 'muro_norte', slug_catalogo: 'pared_paneles', offset_x: 0, offset_z: -1.56, escala_x: 0.56 },
      { clave: 'muro_sur_izquierdo', slug_catalogo: 'pared_paneles', offset_x: -1.08, offset_z: 1.56, rotacion_y: Math.PI, escala_x: 0.2 },
      { clave: 'muro_sur_derecho', slug_catalogo: 'pared_paneles', offset_x: 1.08, offset_z: 1.56, rotacion_y: Math.PI, escala_x: 0.2 },
      { clave: 'muro_oeste', slug_catalogo: 'pared_basica', offset_x: -1.38, offset_z: -0.04, rotacion_y: Math.PI / 2, escala_x: 0.76 },
      { clave: 'muro_este', slug_catalogo: 'pared_basica', offset_x: 1.38, offset_z: -0.04, rotacion_y: Math.PI / 2, escala_x: 0.76 },
      { clave: 'escritorio', slug_catalogo: 'adjustable_desk', offset_x: 0, offset_z: -0.42, rotacion_y: Math.PI },
      { clave: 'silla', slug_catalogo: 'desk_chair', offset_x: 0, offset_z: 0.48 },
      { clave: 'pc', slug_catalogo: 'simple_computer', offset_x: 0, offset_z: -0.78, offset_y: 0.04, sobre_clave: 'escritorio', rotacion_y: Math.PI },
      { clave: 'planta', slug_catalogo: 'houseplant', offset_x: -1.02, offset_z: 0.74 },
    ],
    reglas: {
      editable_por_miembro: true,
      permite_agregar_objetos: false,
      permite_mover_objetos: true,
    },
  },
  comedor: {
    id: 'comedor',
    version: 1,
    nombre: 'Comedor',
    descripcion: 'Área de descanso y comida, con mesas amplias y electrodomésticos.',
    resumen: ['Mesas amplias', 'Cafetera', 'Zona social'],
    color_primario: '#f59e0b',
    color_secundario: '#ef4444',
    ancho_minimo_metros: 8,
    alto_minimo_metros: 8,
    tipo_suelo: FloorType.TILE_WHITE,
    preview: {
      bloques: [
        { x: 10, y: 10, ancho: 80, alto: 80, color: 'rgba(245,158,11,0.15)', redondeado: true },
        { x: 20, y: 30, ancho: 60, alto: 40, color: 'rgba(255,255,255,0.6)' },
        { x: 15, y: 15, ancho: 20, alto: 10, color: 'rgba(239,68,68,0.4)', redondeado: true },
      ],
    },
    subzonas: [],
    objetos: [
      { clave: 'mesa_comedor_1', slug_catalogo: 'table_large_circular', offset_x: -1.5, offset_z: -1 },
      { clave: 'mesa_comedor_2', slug_catalogo: 'table_large_circular', offset_x: 1.5, offset_z: -1 },
      { clave: 'silla_1', slug_catalogo: 'chair', offset_x: -1.5, offset_z: -2.2 },
      { clave: 'silla_2', slug_catalogo: 'chair', offset_x: -1.5, offset_z: 0.2, rotacion_y: Math.PI },
      { clave: 'silla_3', slug_catalogo: 'chair', offset_x: 1.5, offset_z: -2.2 },
      { clave: 'silla_4', slug_catalogo: 'chair', offset_x: 1.5, offset_z: 0.2, rotacion_y: Math.PI },
      { clave: 'mostrador', slug_catalogo: 'small_table', offset_x: 0, offset_z: 2.5, escala_x: 1.5 },
      { clave: 'cafetera', slug_catalogo: 'coffee_machine', offset_x: -0.8, offset_z: 2.5, offset_y: 0.05, sobre_clave: 'mostrador' },
      { clave: 'dispensador', slug_catalogo: 'water_dispenser', offset_x: 2.5, offset_z: 2.5 },
      { clave: 'basurero', slug_catalogo: 'trash_can', offset_x: -2.5, offset_z: 2.5 },
    ],
    reglas: {
      editable_por_miembro: false,
      permite_agregar_objetos: true,
      permite_mover_objetos: true,
    },
  },
  bano: {
    id: 'bano',
    version: 1,
    nombre: 'Baño',
    descripcion: 'Baño estándar con separadores y lavamanos.',
    resumen: ['Separadores', 'Lavamanos', 'Privacidad'],
    color_primario: '#3b82f6',
    color_secundario: '#60a5fa',
    ancho_minimo_metros: 4,
    alto_minimo_metros: 6,
    tipo_suelo: FloorType.TILE_WHITE,
    preview: {
      bloques: [
        { x: 10, y: 10, ancho: 80, alto: 80, color: 'rgba(59,130,246,0.15)', redondeado: true },
        { x: 20, y: 20, ancho: 60, alto: 60, color: 'rgba(255,255,255,0.6)' },
      ],
    },
    subzonas: [],
    objetos: [
      { clave: 'separador_1', slug_catalogo: 'pared_basica', offset_x: 0, offset_z: 0, rotacion_y: Math.PI / 2, escala_x: 0.5 },
      { clave: 'separador_2', slug_catalogo: 'pared_basica', offset_x: 0, offset_z: -1.5, rotacion_y: Math.PI / 2, escala_x: 0.5 },
      { clave: 'lavamanos', slug_catalogo: 'small_table', offset_x: 1.5, offset_z: 1, escala_z: 0.5 },
      { clave: 'espejo', slug_catalogo: 'whiteboard', offset_x: 1.5, offset_z: 1.2, offset_y: 1.2, rotacion_y: Math.PI },
    ],
    reglas: {
      editable_por_miembro: false,
      permite_agregar_objetos: false,
      permite_mover_objetos: false,
    },
  },
  sala_meeting_grande: {
    id: 'sala_meeting_grande',
    version: 1,
    nombre: 'Mega Sala de Meeting',
    descripcion: 'Sala de reuniones de gran capacidad con modo optimizado de video.',
    resumen: ['Modo hablante', 'Mesa gigante', 'Alta capacidad'],
    color_primario: '#b91c1c',
    color_secundario: '#f87171',
    ancho_minimo_metros: 10,
    alto_minimo_metros: 8,
    tipo_suelo: FloorType.WOOD_DARK,
    preview: {
      bloques: [
        { x: 5, y: 5, ancho: 90, alto: 90, color: 'rgba(185,28,28,0.15)', redondeado: true },
        { x: 15, y: 30, ancho: 70, alto: 40, color: 'rgba(255,255,255,0.7)', redondeado: true },
      ],
    },
    subzonas: [
      { clave: 'alfombra_central', nombre: 'Núcleo de reunión', offset_x: 0, offset_z: 0, ancho_metros: 6, alto_metros: 4, tipo_suelo: FloorType.CARPET_OFFICE, color: '#ffffff' },
    ],
    objetos: [
      { clave: 'mesa_principal_1', slug_catalogo: 'table_large_circular', offset_x: -2, offset_z: 0, escala_x: 1.5 },
      { clave: 'mesa_principal_2', slug_catalogo: 'table_large_circular', offset_x: 2, offset_z: 0, escala_x: 1.5 },
      { clave: 'pantalla_gigante', slug_catalogo: 'tv', offset_x: 0, offset_z: -3, offset_y: 1, escala_x: 2, escala_y: 2 },
      { clave: 'silla_1', slug_catalogo: 'office_chair', offset_x: -3, offset_z: -1.5 },
      { clave: 'silla_2', slug_catalogo: 'office_chair', offset_x: -1, offset_z: -1.5 },
      { clave: 'silla_3', slug_catalogo: 'office_chair', offset_x: 1, offset_z: -1.5 },
      { clave: 'silla_4', slug_catalogo: 'office_chair', offset_x: 3, offset_z: -1.5 },
      { clave: 'silla_5', slug_catalogo: 'office_chair', offset_x: -3, offset_z: 1.5, rotacion_y: Math.PI },
      { clave: 'silla_6', slug_catalogo: 'office_chair', offset_x: -1, offset_z: 1.5, rotacion_y: Math.PI },
      { clave: 'silla_7', slug_catalogo: 'office_chair', offset_x: 1, offset_z: 1.5, rotacion_y: Math.PI },
      { clave: 'silla_8', slug_catalogo: 'office_chair', offset_x: 3, offset_z: 1.5, rotacion_y: Math.PI },
    ],
    reglas: {
      editable_por_miembro: false,
      permite_agregar_objetos: false,
      permite_mover_objetos: true,
    },
  },
  piso_base: {
    id: 'piso_base',
    version: 1,
    nombre: 'Piso Base',
    descripcion: 'Zona de piso sin objetos, solo suelo decorativo para cubrir grandes áreas.',
    resumen: ['Solo suelo', 'Sin objetos', 'Área grande'],
    color_primario: '#10b981',
    color_secundario: '#34d399',
    ancho_minimo_metros: 100,
    alto_minimo_metros: 80,
    tipo_suelo: FloorType.CONCRETE_SMOOTH,
    preview: {
      bloques: [
        { x: 5, y: 5, ancho: 90, alto: 90, color: 'rgba(16,185,129,0.12)', redondeado: false },
      ],
    },
    subzonas: [],
    objetos: [],
    reglas: {
      editable_por_miembro: false,
      permite_agregar_objetos: false,
      permite_mover_objetos: false,
    },
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
export const PLANTILLAS_ZONA_OFICINA = Object.values(PLANTILLAS_ZONA);

export const esPlantillaEspacioId = (valor: string | null | undefined): valor is PlantillaEspacioId => {
  return typeof valor === 'string' && valor in PLANTILLAS;
};

export const esPlantillaZonaId = (valor: string | null | undefined): valor is PlantillaZonaId => {
  return typeof valor === 'string' && valor in PLANTILLAS_ZONA;
};

export const obtenerPlantillaEspacio = (valor: string | null | undefined): PlantillaEspacio | null => {
  if (!esPlantillaEspacioId(valor)) {
    return null;
  }

  return PLANTILLAS[valor];
};

export const obtenerPlantillaZona = (valor: string | null | undefined): PlantillaZona | null => {
  if (!esPlantillaZonaId(valor)) {
    return null;
  }

  return PLANTILLAS_ZONA[valor];
};

export interface ZonaEnPlantillaCompleta {
  plantillaId: PlantillaZonaId;
  x: number;
  z: number;
}

export interface PlantillaEspacioCompleta {
  id: string;
  nombre: string;
  descripcion: string;
  capacidadRecomendada: number;
  tipo_suelo_base: FloorType;
  ancho_total_metros: number;
  alto_total_metros: number;
  zonas: ZonaEnPlantillaCompleta[];
}

export const PLANTILLAS_ESPACIO_COMPLETAS: PlantillaEspacioCompleta[] = [
  {
    id: 'oficina_pequena',
    nombre: 'Oficina Pequeña (10 pax)',
    descripcion: 'Un espacio compacto y funcional con cubículos, una sala de juntas y un comedor.',
    capacidadRecomendada: 10,
    tipo_suelo_base: FloorType.WOOD_OAK,
    ancho_total_metros: 20,
    alto_total_metros: 20,
    zonas: [
      { plantillaId: 'sala_juntas', x: 5, z: 5 },
      { plantillaId: 'comedor', x: 15, z: 5 },
      { plantillaId: 'cubiculo', x: 5, z: 15 },
      { plantillaId: 'cubiculo', x: 10, z: 15 },
      { plantillaId: 'cubiculo', x: 15, z: 15 },
      { plantillaId: 'bano', x: 5, z: 10 },
    ]
  },
  {
    id: 'sede_corporativa',
    nombre: 'Sede Corporativa (50 pax)',
    descripcion: 'Espacio grande para corporativos con múltiples áreas de meeting y zonas de enfoque.',
    capacidadRecomendada: 50,
    tipo_suelo_base: FloorType.CARPET_OFFICE,
    ancho_total_metros: 40,
    alto_total_metros: 30,
    zonas: [
      { plantillaId: 'sala_meeting_grande', x: 10, z: 10 },
      { plantillaId: 'sala_juntas', x: 30, z: 10 },
      { plantillaId: 'comedor', x: 20, z: 25 },
      { plantillaId: 'bano', x: 10, z: 25 },
      { plantillaId: 'focus', x: 35, z: 20 },
      { plantillaId: 'focus', x: 35, z: 25 },
      // Cubículos repartidos
      { plantillaId: 'cubiculo', x: 5, z: 20 },
      { plantillaId: 'cubiculo', x: 10, z: 20 },
      { plantillaId: 'cubiculo', x: 15, z: 20 },
      { plantillaId: 'cubiculo', x: 5, z: 25 },
    ]
  },
  {
    id: 'startup_hub',
    nombre: 'Startup Hub (25 pax)',
    descripcion: 'Espacio ágil para startups: áreas abiertas, focus rooms y una sala de meeting grande.',
    capacidadRecomendada: 25,
    tipo_suelo_base: FloorType.CONCRETE_SMOOTH,
    ancho_total_metros: 30,
    alto_total_metros: 25,
    zonas: [
      { plantillaId: 'sala_meeting_grande', x: 5, z: 5 },
      { plantillaId: 'sala_juntas', x: 20, z: 5 },
      { plantillaId: 'focus', x: 5, z: 15 },
      { plantillaId: 'focus', x: 10, z: 15 },
      { plantillaId: 'comedor', x: 20, z: 15 },
      { plantillaId: 'cubiculo', x: 5, z: 22 },
      { plantillaId: 'cubiculo', x: 10, z: 22 },
      { plantillaId: 'cubiculo', x: 15, z: 22 },
      { plantillaId: 'cubiculo', x: 20, z: 22 },
      { plantillaId: 'bano', x: 25, z: 22 },
    ]
  },
  {
    id: 'centro_42_cubiculos',
    nombre: 'Centro de Trabajo (42 pax)',
    descripcion: 'Gran espacio abierto con 42 puestos de trabajo variados, 1 sala de reuniones y 1 baño, distribuidos ampliamente sobre un piso verde.',
    capacidadRecomendada: 42,
    tipo_suelo_base: FloorType.CONCRETE_SMOOTH,
    ancho_total_metros: 100,
    alto_total_metros: 80,
    zonas: [
      // --- PISO BASE (100×80m) — cubre todo el espacio ---
      { plantillaId: 'piso_base', x: 50, z: 40 },

      // --- Sala de reuniones (6×5m) — zona central superior ---
      { plantillaId: 'sala_juntas', x: 47, z: 3 },
      // --- Baño (4×6m) — zona central inferior ---
      { plantillaId: 'bano', x: 48, z: 72 },

      // --- 42 puestos de trabajo — alternando cubiculo (4×4m) y focus (3.5×4m) para variedad visual ---
      // Fila 1 (z = 5) — patrón: cubiculo, focus, cubiculo, focus, cubiculo, focus
      { plantillaId: 'cubiculo', x: 3, z: 5 },
      { plantillaId: 'focus', x: 20, z: 5 },
      { plantillaId: 'cubiculo', x: 37, z: 5 },
      { plantillaId: 'focus', x: 60, z: 5 },
      { plantillaId: 'cubiculo', x: 77, z: 5 },
      { plantillaId: 'focus', x: 94, z: 5 },
      // Fila 2 (z = 17) — patrón invertido: focus, cubiculo, focus, cubiculo, focus, cubiculo
      { plantillaId: 'focus', x: 3, z: 17 },
      { plantillaId: 'cubiculo', x: 20, z: 17 },
      { plantillaId: 'focus', x: 37, z: 17 },
      { plantillaId: 'cubiculo', x: 60, z: 17 },
      { plantillaId: 'focus', x: 77, z: 17 },
      { plantillaId: 'cubiculo', x: 94, z: 17 },
      // Fila 3 (z = 29) — patrón: cubiculo, focus, cubiculo, focus, cubiculo, focus
      { plantillaId: 'cubiculo', x: 3, z: 29 },
      { plantillaId: 'focus', x: 20, z: 29 },
      { plantillaId: 'cubiculo', x: 37, z: 29 },
      { plantillaId: 'focus', x: 60, z: 29 },
      { plantillaId: 'cubiculo', x: 77, z: 29 },
      { plantillaId: 'focus', x: 94, z: 29 },
      // Fila 4 (z = 41) — patrón invertido: focus, cubiculo, focus, cubiculo, focus, cubiculo
      { plantillaId: 'focus', x: 3, z: 41 },
      { plantillaId: 'cubiculo', x: 20, z: 41 },
      { plantillaId: 'focus', x: 37, z: 41 },
      { plantillaId: 'cubiculo', x: 60, z: 41 },
      { plantillaId: 'focus', x: 77, z: 41 },
      { plantillaId: 'cubiculo', x: 94, z: 41 },
      // Fila 5 (z = 53) — patrón: cubiculo, focus, cubiculo, focus, cubiculo, focus
      { plantillaId: 'cubiculo', x: 3, z: 53 },
      { plantillaId: 'focus', x: 20, z: 53 },
      { plantillaId: 'cubiculo', x: 37, z: 53 },
      { plantillaId: 'focus', x: 60, z: 53 },
      { plantillaId: 'cubiculo', x: 77, z: 53 },
      { plantillaId: 'focus', x: 94, z: 53 },
      // Fila 6 (z = 65) — patrón invertido: focus, cubiculo, focus, cubiculo, focus, cubiculo
      { plantillaId: 'focus', x: 3, z: 65 },
      { plantillaId: 'cubiculo', x: 20, z: 65 },
      { plantillaId: 'focus', x: 37, z: 65 },
      { plantillaId: 'cubiculo', x: 60, z: 65 },
      { plantillaId: 'focus', x: 77, z: 65 },
      { plantillaId: 'cubiculo', x: 94, z: 65 },
      // Fila 7 (z = 75) — patrón: cubiculo, focus, cubiculo, focus, cubiculo, focus
      { plantillaId: 'cubiculo', x: 3, z: 75 },
      { plantillaId: 'focus', x: 20, z: 75 },
      { plantillaId: 'cubiculo', x: 37, z: 75 },
      { plantillaId: 'focus', x: 60, z: 75 },
      { plantillaId: 'cubiculo', x: 77, z: 75 },
      { plantillaId: 'focus', x: 94, z: 75 },
    ]
  }
];

/** Validate that zones in a full template don't overlap each other */
export const validarPlantillaEspacioCompleta = (plantilla: PlantillaEspacioCompleta): { valida: boolean; conflictos: string[] } => {
  const conflictos: string[] = [];
  const zonasConBounds = plantilla.zonas.map(z => {
    const pz = obtenerPlantillaZona(z.plantillaId);
    if (!pz) return null;
    return {
      id: z.plantillaId,
      x: z.x, z: z.z,
      w: pz.ancho_minimo_metros, h: pz.alto_minimo_metros,
    };
  }).filter(Boolean) as { id: string; x: number; z: number; w: number; h: number }[];

  for (let i = 0; i < zonasConBounds.length; i++) {
    for (let j = i + 1; j < zonasConBounds.length; j++) {
      const a = zonasConBounds[i];
      const b = zonasConBounds[j];
      const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
      const overlapZ = a.z < b.z + b.h && a.z + a.h > b.z;
      if (overlapX && overlapZ) {
        conflictos.push(`${a.id}@(${a.x},${a.z}) ↔ ${b.id}@(${b.x},${b.z})`);
      }
    }
  }

  return { valida: conflictos.length === 0, conflictos };
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
