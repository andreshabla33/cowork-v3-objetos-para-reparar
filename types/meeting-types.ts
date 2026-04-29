/**
 * Tipos unificados para el sistema de reuniones
 * Usado por: CalendarPanel, MeetingRoom, RecordingManager, Analytics
 * 
 * Best Practices 2026:
 * - RBAC granular por cargo
 * - UI adaptativa según rol
 * - Modelo de datos consistente
 */

import { CargoLaboral, TipoGrabacionDetallado } from '../components/meetings/recording/types/analysis';

// ==================== TIPOS UNIFICADOS ====================

/**
 * Tipos de reunión unificados para todo el sistema
 */
export type TipoReunionUnificado = 
  | 'equipo'           // Reunión de equipo interno
  | 'one_to_one'       // 1:1 con colaborador
  | 'cliente'          // Deal/Comercial con cliente externo
  | 'candidato';       // Entrevista RRHH con candidato

/**
 * Mapeo entre tipo de reunión y tipo de grabación/análisis
 */
export const MAPEO_TIPO_GRABACION: Record<TipoReunionUnificado, TipoGrabacionDetallado> = {
  equipo: 'equipo',
  one_to_one: 'rrhh_one_to_one',
  cliente: 'deals',
  candidato: 'rrhh_entrevista'
};

// ==================== CONFIGURACIÓN UI ====================

export interface ConfiguracionTipoReunion {
  tipo: TipoReunionUnificado;
  label: string;
  icon: string;
  color: string;
  colorAccent: string;
  descripcion: string;
  requiereInvitadoExterno: boolean;
  camposExtras?: ('empresa' | 'puesto_aplicado')[];
  cargosPermitidos: CargoLaboral[];
  requiereDisclaimer: boolean;
}

/**
 * Configuración completa de cada tipo de reunión
 * Incluye: UI, permisos, campos requeridos
 */
export const TIPOS_REUNION_CONFIG: Record<TipoReunionUnificado, ConfiguracionTipoReunion> = {
  equipo: {
    tipo: 'equipo',
    label: 'Reunión de Equipo',
    icon: '👥',
    color: 'from-blue-600 to-blue-600',
    colorAccent: '#1d4ed8',
    descripcion: 'Reuniones de trabajo, brainstorming, retrospectivas',
    requiereInvitadoExterno: false,
    cargosPermitidos: [
      'ceo', 'coo', 
      'manager_equipo', 'team_lead', 'product_owner', 'scrum_master',
      'colaborador', 'otro'
    ],
    requiereDisclaimer: false
  },
  one_to_one: {
    tipo: 'one_to_one',
    label: 'One-to-One',
    icon: '💬',
    color: 'from-cyan-600 to-blue-600',
    colorAccent: '#0891b2',
    descripcion: 'Reunión individual con colaborador del equipo',
    requiereInvitadoExterno: false,
    cargosPermitidos: [
      'ceo', 'coo', 
      'director_rrhh', 'coordinador_rrhh',
      'manager_equipo', 'team_lead'
    ],
    requiereDisclaimer: true
  },
  cliente: {
    tipo: 'cliente',
    label: 'Reunión Comercial',
    icon: '🤝',
    color: 'from-green-600 to-emerald-600',
    colorAccent: '#059669',
    descripcion: 'Negociaciones, presentaciones y cierre de deals',
    requiereInvitadoExterno: true,
    camposExtras: ['empresa'],
    cargosPermitidos: [
      'ceo', 'coo',
      'director_comercial', 'coordinador_ventas', 'asesor_comercial'
    ],
    requiereDisclaimer: false
  },
  candidato: {
    tipo: 'candidato',
    label: 'Entrevista Candidato',
    icon: '🎯',
    color: 'from-blue-600 to-blue-700',
    colorAccent: '#4f46e5',
    descripcion: 'Entrevistas de selección con candidatos externos',
    requiereInvitadoExterno: true,
    camposExtras: ['puesto_aplicado'],
    cargosPermitidos: [
      'ceo', 'coo',
      'director_rrhh', 'coordinador_rrhh', 'reclutador'
    ],
    requiereDisclaimer: true
  }
};

// ==================== FUNCIONES RBAC ====================

/**
 * Obtiene los tipos de reunión disponibles según el cargo del usuario
 * Implementa RBAC (Role-Based Access Control)
 */
export function getTiposReunionPorCargo(cargo: CargoLaboral): TipoReunionUnificado[] {
  return (Object.entries(TIPOS_REUNION_CONFIG) as [TipoReunionUnificado, ConfiguracionTipoReunion][])
    .filter(([_, config]) => config.cargosPermitidos.includes(cargo))
    .map(([tipo]) => tipo);
}

/**
 * Verifica si un cargo tiene permiso para crear un tipo de reunión
 */
export function puedeCrearTipoReunion(cargo: CargoLaboral, tipo: TipoReunionUnificado): boolean {
  const config = TIPOS_REUNION_CONFIG[tipo];
  return config.cargosPermitidos.includes(cargo);
}

/**
 * Obtiene la configuración de un tipo de reunión
 */
export function getConfiguracionTipo(tipo: TipoReunionUnificado): ConfiguracionTipoReunion {
  return TIPOS_REUNION_CONFIG[tipo];
}

/**
 * Obtiene el tipo de grabación correspondiente a un tipo de reunión
 */
export function getTipoGrabacion(tipoReunion: TipoReunionUnificado): TipoGrabacionDetallado {
  return MAPEO_TIPO_GRABACION[tipoReunion];
}

// ==================== INVITADO EXTERNO ====================

export interface InvitadoExterno {
  id?: string;
  email: string;
  nombre: string;
  empresa?: string;          // Solo para tipo 'cliente'
  puesto_aplicado?: string;  // Solo para tipo 'candidato'
}

/**
 * Valida los campos requeridos de un invitado según el tipo de reunión
 */
export function validarInvitadoExterno(
  invitado: Partial<InvitadoExterno>, 
  tipo: TipoReunionUnificado
): { valido: boolean; errores: string[] } {
  const errores: string[] = [];
  const config = TIPOS_REUNION_CONFIG[tipo];
  
  if (!invitado.email?.trim()) {
    errores.push('El email es requerido');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitado.email)) {
    errores.push('El email no es válido');
  }
  
  if (!invitado.nombre?.trim()) {
    errores.push('El nombre es requerido');
  }
  
  if (config.camposExtras?.includes('empresa') && !invitado.empresa?.trim()) {
    errores.push('El nombre de la empresa es requerido');
  }
  
  if (config.camposExtras?.includes('puesto_aplicado') && !invitado.puesto_aplicado?.trim()) {
    errores.push('El puesto al que aplica es requerido');
  }
  
  return {
    valido: errores.length === 0,
    errores
  };
}

// ==================== CONFIGURACIÓN SALA ====================

/**
 * Estructura de configuración para guardar en salas_reunion.configuracion
 */
export interface ConfiguracionSalaReunion {
  reunion_id?: string;
  tipo_reunion: TipoReunionUnificado;
  tipo_grabacion: TipoGrabacionDetallado;
  invitados_externos?: InvitadoExterno[];
  permitir_grabacion: boolean;
  analisis_conductual: boolean;
  sala_espera: boolean;
  es_programada: boolean;
  max_participantes: number;
}

/**
 * Crea la configuración de sala basada en el tipo de reunión
 */
export function crearConfiguracionSala(
  tipo: TipoReunionUnificado,
  invitados?: InvitadoExterno[],
  reunionId?: string
): ConfiguracionSalaReunion {
  const config = TIPOS_REUNION_CONFIG[tipo];
  
  return {
    reunion_id: reunionId,
    tipo_reunion: tipo,
    tipo_grabacion: MAPEO_TIPO_GRABACION[tipo],
    invitados_externos: config.requiereInvitadoExterno ? invitados : undefined,
    permitir_grabacion: true,
    analisis_conductual: true,
    sala_espera: config.requiereInvitadoExterno, // Solo para externos
    es_programada: true,
    max_participantes: tipo === 'equipo' ? 50 : 10
  };
}
