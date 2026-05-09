/**
 * @module domain/entities/terrenoMarketplace
 * @description Entidades del marketplace de terrenos virtuales.
 *
 * Clean Architecture: capa Domain. Sin dependencias externas — TS puro.
 * Las queries Supabase viven en `ITerrenoMarketplaceRepository` (port) +
 * `TerrenoMarketplaceSupabaseRepository` (adapter).
 */

/**
 * Empresa publicada en el marketplace público (cross-espacio).
 */
export interface EmpresaPublica {
  id: string;
  nombre: string;
  industria: string | null;
  tamano: string | null;
  descripcion: string | null;
  logo_url: string | null;
  sitio_web: string | null;
  miembros_count: number;
}

/**
 * Objeto del espacio publicado en el marketplace.
 */
export interface ObjetoEspacio {
  id: string;
  tipo: string;
  nombre: string;
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_y: number;
  escala_x: number;
  escala_y: number;
  escala_z: number;
  owner_id: string | null;
  modelo_url: string | null;
}

/**
 * Configuración visual de los tiers de terrenos del marketplace.
 * Lookup table puro — no requiere queries.
 */
export const TIER_CONFIG = {
  starter: {
    label: 'Starter',
    subtitulo: 'Oficina Básica',
    color: '#22c55e',
    bgGradient: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-400',
  },
  professional: {
    label: 'Professional',
    subtitulo: 'Piso Corporativo',
    color: '#3b82f6',
    bgGradient: 'from-blue-500/20 to-indigo-500/20',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
  },
  enterprise: {
    label: 'Enterprise',
    subtitulo: 'Edificio Propio',
    color: '#a855f7',
    bgGradient: 'from-purple-500/20 to-violet-500/20',
    borderColor: 'border-purple-500/30',
    textColor: 'text-violet-400',
  },
} as const;

export type TerrenoTier = keyof typeof TIER_CONFIG;
