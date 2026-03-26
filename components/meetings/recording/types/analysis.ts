/**
 * Tipos e interfaces para el sistema de análisis conductual
 * Incluye definiciones para: RRHH, Deals, Reuniones de Equipo
 * v2.1: Sistema de cargos laborales y permisos por rol
 */

// ==================== CARGOS LABORALES Y PERMISOS ====================

/**
 * Cargos laborales que tienen acceso a análisis conductual
 */
export type CargoLaboral = 
  // Ejecutivos
  | 'ceo'
  | 'coo'
  // RRHH
  | 'director_rrhh'
  | 'coordinador_rrhh'
  | 'reclutador'
  // Comercial/Ventas
  | 'director_comercial'
  | 'coordinador_ventas'
  | 'asesor_comercial'
  // Equipos
  | 'manager_equipo'
  | 'team_lead'
  | 'product_owner'
  | 'scrum_master'
  // Otros (sin acceso a análisis conductual)
  | 'colaborador'
  | 'otro';

/**
 * Tipos de grabación detallados (separando RRHH)
 */
export type TipoGrabacionDetallado = 
  | 'rrhh_entrevista'    // Entrevista a candidatos
  | 'rrhh_one_to_one'    // One-to-one con colaborador
  | 'deals'              // Negociaciones comerciales
  | 'equipo';            // Reuniones de equipo

/**
 * Matriz de permisos por cargo para cada tipo de análisis
 */
export const PERMISOS_ANALISIS: Record<CargoLaboral, {
  rrhh_entrevista: boolean;
  rrhh_one_to_one: boolean;
  deals: boolean;
  equipo: boolean;
  ver_transcripcion: boolean;
}> = {
  // CEO - Acceso total
  ceo: { rrhh_entrevista: true, rrhh_one_to_one: true, deals: true, equipo: true, ver_transcripcion: true },
  // COO - Acceso total
  coo: { rrhh_entrevista: true, rrhh_one_to_one: true, deals: true, equipo: true, ver_transcripcion: true },
  // Director RRHH - Solo RRHH
  director_rrhh: { rrhh_entrevista: true, rrhh_one_to_one: true, deals: false, equipo: false, ver_transcripcion: true },
  // Coordinador RRHH - Solo RRHH
  coordinador_rrhh: { rrhh_entrevista: true, rrhh_one_to_one: true, deals: false, equipo: false, ver_transcripcion: true },
  // Reclutador - Solo entrevistas candidatos
  reclutador: { rrhh_entrevista: true, rrhh_one_to_one: false, deals: false, equipo: false, ver_transcripcion: true },
  // Director Comercial - Solo deals
  director_comercial: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: true, equipo: false, ver_transcripcion: true },
  // Coordinador Ventas - Solo deals
  coordinador_ventas: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: true, equipo: false, ver_transcripcion: true },
  // Asesor Comercial - Solo deals
  asesor_comercial: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: true, equipo: false, ver_transcripcion: true },
  // Manager de Equipo - Solo equipo
  manager_equipo: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: true, ver_transcripcion: true },
  // Team Lead - Solo equipo
  team_lead: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: true, ver_transcripcion: true },
  // Product Owner - Solo equipo
  product_owner: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: true, ver_transcripcion: true },
  // Scrum Master - Solo equipo
  scrum_master: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: true, ver_transcripcion: true },
  // Colaborador - Solo transcripción
  colaborador: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: false, ver_transcripcion: true },
  // Otro - Solo transcripción
  otro: { rrhh_entrevista: false, rrhh_one_to_one: false, deals: false, equipo: false, ver_transcripcion: true },
};

/**
 * Información de cargos para UI
 */
export const INFO_CARGOS: Record<CargoLaboral, {
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: 'ejecutivo' | 'rrhh' | 'comercial' | 'equipo' | 'general';
}> = {
  ceo: { nombre: 'CEO', descripcion: 'Director Ejecutivo', icono: '👔', categoria: 'ejecutivo' },
  coo: { nombre: 'COO', descripcion: 'Director de Operaciones', icono: '⚙️', categoria: 'ejecutivo' },
  director_rrhh: { nombre: 'Director RRHH', descripcion: 'Director de Recursos Humanos', icono: '👥', categoria: 'rrhh' },
  coordinador_rrhh: { nombre: 'Coordinador RRHH', descripcion: 'Coordinador de Recursos Humanos', icono: '📋', categoria: 'rrhh' },
  reclutador: { nombre: 'Reclutador', descripcion: 'Especialista en Selección', icono: '🔍', categoria: 'rrhh' },
  director_comercial: { nombre: 'Director Comercial', descripcion: 'Director de Ventas', icono: '📈', categoria: 'comercial' },
  coordinador_ventas: { nombre: 'Coordinador Ventas', descripcion: 'Coordinador del equipo comercial', icono: '🎯', categoria: 'comercial' },
  asesor_comercial: { nombre: 'Asesor Comercial', descripcion: 'Ejecutivo de ventas', icono: '💼', categoria: 'comercial' },
  manager_equipo: { nombre: 'Manager', descripcion: 'Manager de Equipo', icono: '👨‍💼', categoria: 'equipo' },
  team_lead: { nombre: 'Team Lead', descripcion: 'Líder Técnico', icono: '🚀', categoria: 'equipo' },
  product_owner: { nombre: 'Product Owner', descripcion: 'Dueño del Producto', icono: '📦', categoria: 'equipo' },
  scrum_master: { nombre: 'Scrum Master', descripcion: 'Facilitador Agile', icono: '🔄', categoria: 'equipo' },
  colaborador: { nombre: 'Colaborador', descripcion: 'Miembro del equipo', icono: '👤', categoria: 'general' },
  otro: { nombre: 'Otro', descripcion: 'Otro cargo', icono: '➕', categoria: 'general' },
};

/**
 * Verificar si un cargo tiene permiso para ver análisis de un tipo de grabación
 */
export function tienePermisoAnalisis(cargo: CargoLaboral, tipoGrabacion: TipoGrabacionDetallado): boolean {
  const permisos = PERMISOS_ANALISIS[cargo];
  if (!permisos) return false;
  return permisos[tipoGrabacion] ?? false;
}

/**
 * Obtener tipos de grabación disponibles para un cargo
 */
export function getTiposGrabacionDisponibles(cargo: CargoLaboral): TipoGrabacionDetallado[] {
  const permisos = PERMISOS_ANALISIS[cargo];
  const tipos: TipoGrabacionDetallado[] = [];
  
  if (permisos.rrhh_entrevista) tipos.push('rrhh_entrevista');
  if (permisos.rrhh_one_to_one) tipos.push('rrhh_one_to_one');
  if (permisos.deals) tipos.push('deals');
  if (permisos.equipo) tipos.push('equipo');
  
  return tipos;
}

/**
 * Verificar si un cargo puede iniciar grabación con análisis
 */
export function puedeIniciarGrabacionConAnalisis(cargo: CargoLaboral): boolean {
  return getTiposGrabacionDisponibles(cargo).length > 0;
}

// ==================== TIPOS BASE ====================

// Tipo simplificado para compatibilidad
export type TipoGrabacion = 'rrhh' | 'deals' | 'equipo';

export type EmotionType = 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted' | 'neutral' | 'contempt';

export type PosturaType = 'abierta' | 'cerrada' | 'inclinado_adelante' | 'inclinado_atras' | 'neutral';

export type GestoType = 'manos_activas' | 'auto_toque' | 'brazos_cruzados' | 'manos_juntas' | 'neutral';

// ==================== CONFIGURACIÓN POR TIPO ====================

export interface ConfiguracionGrabacion {
  tipo: TipoGrabacionDetallado;
  tipoBase: TipoGrabacion;
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  colorAccent: string;
  requiereDisclaimer: boolean;
  disclaimerTexto?: string;
  metricas: string[];
  cargosPermitidos: CargoLaboral[];
}

export const CONFIGURACIONES_GRABACION_DETALLADO: Record<TipoGrabacionDetallado, ConfiguracionGrabacion> = {
  rrhh_entrevista: {
    tipo: 'rrhh_entrevista',
    tipoBase: 'rrhh',
    titulo: 'Entrevista Candidatos',
    descripcion: 'Entrevistas de selección con candidatos externos',
    icono: '�',
    color: 'from-blue-600 to-indigo-600',
    colorAccent: '#4f46e5',
    requiereDisclaimer: true,
    disclaimerTexto: `⚠️ AVISO LEGAL - ENTREVISTA DE SELECCIÓN

Esta grabación incluye análisis conductual automatizado como herramienta de APOYO.

IMPORTANTE:
• El candidato DEBE ser informado y dar consentimiento explícito
• Los datos son indicadores observados, NO diagnósticos psicológicos
• No debe usarse como único criterio de decisión
• Cumple con GDPR y normativas de protección de datos

Al continuar, confirmas que:
✓ El candidato ha sido informado del análisis
✓ Has obtenido su consentimiento expreso`,
    metricas: [
      'congruencia_verbal_no_verbal',
      'nivel_nerviosismo',
      'confianza_percibida',
      'engagement_por_pregunta',
      'momentos_incomodidad',
      'prediccion_fit_cultural',
    ],
    cargosPermitidos: ['ceo', 'coo', 'director_rrhh', 'coordinador_rrhh', 'reclutador'],
  },
  rrhh_one_to_one: {
    tipo: 'rrhh_one_to_one',
    tipoBase: 'rrhh',
    titulo: 'One-to-One',
    descripcion: 'Reunión individual con colaborador del equipo',
    icono: '💬',
    color: 'from-cyan-600 to-blue-600',
    colorAccent: '#0891b2',
    requiereDisclaimer: true,
    disclaimerTexto: `⚠️ AVISO LEGAL - REUNIÓN ONE-TO-ONE

Esta grabación incluye análisis conductual como herramienta de desarrollo.

IMPORTANTE:
• El colaborador DEBE ser informado y dar consentimiento
• Los datos apoyan la conversación, NO evalúan desempeño
• Objetivo: mejorar comunicación y bienestar laboral
• Cumple con normativas de privacidad laboral

Al continuar, confirmas que:
✓ El colaborador ha sido informado del análisis
✓ Has obtenido su consentimiento expreso`,
    metricas: [
      'congruencia_verbal_no_verbal',
      'nivel_comodidad',
      'engagement_por_tema',
      'momentos_preocupacion',
      'señales_satisfaccion',
      'apertura_comunicacion',
    ],
    cargosPermitidos: ['ceo', 'coo', 'director_rrhh', 'coordinador_rrhh'],
  },
  deals: {
    tipo: 'deals',
    tipoBase: 'deals',
    titulo: 'Reunión Comercial',
    descripcion: 'Negociaciones, presentaciones y cierre de deals',
    icono: '🤝',
    color: 'from-green-600 to-emerald-600',
    colorAccent: '#059669',
    requiereDisclaimer: false,
    metricas: [
      'momentos_interes',
      'señales_objecion',
      'engagement_por_tema',
      'señales_cierre',
      'prediccion_probabilidad_cierre',
      'puntos_dolor_detectados',
    ],
    cargosPermitidos: ['ceo', 'coo', 'director_comercial', 'coordinador_ventas', 'asesor_comercial'],
  },
  equipo: {
    tipo: 'equipo',
    tipoBase: 'equipo',
    titulo: 'Reunión de Equipo',
    descripcion: 'Reuniones de trabajo, brainstorming, retrospectivas',
    icono: '👥',
    color: 'from-purple-600 to-violet-600',
    colorAccent: '#7c3aed',
    requiereDisclaimer: false,
    metricas: [
      'participacion_por_persona',
      'engagement_grupal',
      'reacciones_a_ideas',
      'momentos_desconexion',
      'dinamica_grupal',
      'prediccion_adopcion_ideas',
    ],
    cargosPermitidos: ['ceo', 'coo', 'manager_equipo', 'team_lead', 'product_owner', 'scrum_master'],
  },
};

// Mantener compatibilidad con versión anterior
export const CONFIGURACIONES_GRABACION: Record<TipoGrabacion, ConfiguracionGrabacion> = {
  rrhh: CONFIGURACIONES_GRABACION_DETALLADO.rrhh_entrevista,
  deals: CONFIGURACIONES_GRABACION_DETALLADO.deals,
  equipo: CONFIGURACIONES_GRABACION_DETALLADO.equipo,
};

/**
 * Obtiene la configuración de grabación con métricas customizadas.
 * Prioridad: cache Supabase (por espacio) → defaults hardcodeados.
 * El cache se llena al cargar el espacio via cargarMetricasEspacio().
 * @param tipo - Tipo de grabación detallado
 * @param espacioId - ID del espacio activo (opcional, mejora cache hit)
 * @returns ConfiguracionGrabacion con métricas del espacio o defaults
 */
export function getConfiguracionConMetricasCustom(tipo: TipoGrabacionDetallado, espacioId?: string): ConfiguracionGrabacion {
  const config = { ...CONFIGURACIONES_GRABACION_DETALLADO[tipo] };
  
  try {
    // Importación dinámica para evitar dependencia circular
    // getMetricasCached es síncrono y lee del cache en memoria
    const { getMetricasCached } = require('../../../lib/metricasAnalisis');
    const metricasCustom = getMetricasCached(tipo, espacioId);
    if (Array.isArray(metricasCustom) && metricasCustom.length > 0) {
      config.metricas = metricasCustom;
    }
  } catch {
    // Fallback a métricas por defecto si hay error (primera carga, etc.)
  }
  
  return config;
}

// ==================== ANÁLISIS FACIAL ====================

export interface MicroexpresionData {
  timestamp_ms: number;
  emocion: EmotionType;
  intensidad: number; // 0-1
  duracion_ms: number;
  es_microexpresion: boolean; // < 500ms
  action_units: Record<string, number>;
}

export interface EmotionFrame {
  timestamp_segundos: number;
  emocion_dominante: EmotionType;
  emociones_scores: Record<EmotionType, number>;
  engagement_score: number;
  confianza_deteccion: number;
  action_units: Record<string, number>;
  mirando_camara: boolean;
  cambio_abrupto: boolean;
  delta_vs_baseline: number;
}

export interface BaselineEmocional {
  emociones_promedio: Record<EmotionType, number>;
  engagement_promedio: number;
  variabilidad: number;
  timestamp_inicio: number;
  timestamp_fin: number;
}

// ==================== ANÁLISIS CORPORAL ====================

export interface BodyLanguageFrame {
  timestamp_segundos: number;
  postura: PosturaType;
  postura_score: number; // -1 (cerrada) a 1 (abierta)
  inclinacion_x: number; // grados
  inclinacion_y: number;
  gestos_manos: GestoType;
  actividad_manos: number; // 0-1
  auto_toque_detectado: boolean;
  brazos_cruzados: boolean;
  hombros_tension: number; // 0-1
}

export interface PosturaAnalysis {
  postura_dominante: PosturaType;
  tiempo_postura_abierta_pct: number;
  tiempo_postura_cerrada_pct: number;
  cambios_postura: number;
  momentos_tension: { timestamp: number; intensidad: number }[];
}

// ==================== PREDICCIONES DE COMPORTAMIENTO ====================

export interface PrediccionComportamiento {
  tipo: string;
  probabilidad: number; // 0-1
  confianza: number; // 0-1
  factores: string[];
  timestamp: number;
}

// ==================== ANÁLISIS POR TIPO DE GRABACIÓN ====================

// RRHH / Entrevistas
export interface AnalisisRRHH {
  tipo: 'rrhh';
  
  // Métricas de congruencia
  congruencia_verbal_no_verbal: number; // 0-1
  
  // Timeline de nerviosismo (normalizado por baseline)
  nerviosismo_timeline: { timestamp: number; score: number; trigger?: string }[];
  nerviosismo_promedio: number;
  
  // Confianza percibida
  confianza_percibida: number;
  momentos_alta_confianza: { timestamp: number; duracion: number }[];
  momentos_baja_confianza: { timestamp: number; duracion: number }[];
  
  // Incomodidad por temas
  momentos_incomodidad: { 
    timestamp: number; 
    duracion: number; 
    indicadores: string[];
  }[];
  
  // Engagement durante la entrevista
  engagement_timeline: { timestamp: number; score: number }[];
  
  // Predicciones
  predicciones: {
    fit_cultural: PrediccionComportamiento;
    nivel_interes_puesto: PrediccionComportamiento;
    autenticidad_respuestas: PrediccionComportamiento;
  };
  
  // Resumen ejecutivo
  resumen: {
    fortalezas_observadas: string[];
    areas_atencion: string[];
    recomendacion_seguimiento: string;
  };
}

// Deals / Ventas
export interface AnalisisDeals {
  tipo: 'deals';
  
  // Momentos de interés del cliente
  momentos_interes: { 
    timestamp: number; 
    score: number; 
    tema_discutido?: string;
    indicadores: string[];
  }[];
  
  // Señales de objeción
  señales_objecion: { 
    timestamp: number; 
    tipo: 'precio' | 'timing' | 'caracteristicas' | 'competencia' | 'desconocido';
    intensidad: number;
    indicadores: string[];
  }[];
  
  // Engagement por tema
  engagement_por_tema: { 
    tema: string; 
    inicio: number;
    fin: number;
    engagement_promedio: number;
    pico_engagement: number;
  }[];
  
  // Señales de cierre
  señales_cierre: { 
    timestamp: number; 
    tipo: 'positiva' | 'negativa';
    indicadores: string[];
  }[];
  
  // Puntos de dolor detectados
  puntos_dolor: {
    timestamp: number;
    descripcion: string;
    reaccion_emocional: EmotionType;
    intensidad: number;
  }[];
  
  // Predicciones
  predicciones: {
    probabilidad_cierre: PrediccionComportamiento;
    siguiente_paso_recomendado: PrediccionComportamiento;
    objecion_principal: PrediccionComportamiento;
  };
  
  // Resumen ejecutivo
  resumen: {
    momentos_clave: string[];
    objeciones_detectadas: string[];
    recomendaciones_seguimiento: string[];
    probabilidad_cierre_estimada: number;
  };
}

// Reuniones de Equipo
export interface AnalisisEquipo {
  tipo: 'equipo';
  
  // Participación por persona
  participacion: {
    usuario_id: string;
    usuario_nombre: string;
    tiempo_hablando_segundos: number;
    tiempo_hablando_pct: number;
    engagement_promedio: number;
    intervenciones: number;
    reacciones_positivas_recibidas: number;
    reacciones_negativas_recibidas: number;
  }[];
  
  // Engagement grupal timeline
  engagement_grupal: { 
    timestamp: number; 
    score_promedio: number;
    participantes_engaged: number;
    participantes_total: number;
  }[];
  
  // Reacciones a ideas presentadas
  reacciones_ideas: {
    presenter_id: string;
    presenter_nombre: string;
    timestamp: number;
    duracion_presentacion: number;
    reaccion_grupal: 'positiva' | 'neutral' | 'mixta' | 'negativa';
    engagement_promedio: number;
    emociones_predominantes: EmotionType[];
  }[];
  
  // Momentos de desconexión grupal
  momentos_desconexion: {
    timestamp: number;
    duracion: number;
    participantes_desconectados: string[];
    posible_causa: string;
  }[];
  
  // Dinámica grupal
  dinamica_grupal: {
    cohesion_score: number; // 0-1
    participacion_equilibrada: boolean;
    lideres_naturales: string[];
    participantes_pasivos: string[];
  };
  
  // Predicciones
  predicciones: {
    adopcion_ideas: PrediccionComportamiento;
    necesidad_seguimiento: PrediccionComportamiento;
    riesgo_conflicto: PrediccionComportamiento;
  };
  
  // Resumen ejecutivo
  resumen: {
    ideas_mejor_recibidas: string[];
    participantes_destacados: string[];
    areas_mejora_equipo: string[];
    recomendaciones: string[];
  };
}

export type AnalisisCompleto = AnalisisRRHH | AnalisisDeals | AnalisisEquipo;

// ==================== RESULTADO FINAL ====================

export interface ResultadoAnalisis {
  grabacion_id: string;
  tipo_grabacion: TipoGrabacion;
  duracion_segundos: number;
  participantes: { id: string; nombre: string }[];
  
  // Datos raw
  frames_faciales: EmotionFrame[];
  frames_corporales: BodyLanguageFrame[];
  microexpresiones: MicroexpresionData[];
  baseline: BaselineEmocional | null;
  
  // Análisis específico por tipo
  analisis: AnalisisCompleto;
  
  // Metadatos
  modelo_version: string;
  procesado_en: string;
  confianza_general: number;
}
