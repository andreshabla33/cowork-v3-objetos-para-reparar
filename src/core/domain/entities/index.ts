/**
 * @module core/domain/entities
 * Entidades de Dominio para el sistema de Pisos y Subsuelos del espacio 3D.
 * Clean Architecture: Esta capa NO depende de frameworks ni librerías externas.
 */

import type { FloorType } from './tiposSuelo';

export { FloorType, FLOOR_TYPE_CATEGORIES, FLOOR_TYPE_LABELS, TIPOS_SUELO, esTipoSueloValido, normalizarTipoSuelo } from './tiposSuelo';

// ─── Entidades de Dominio ────────────────────────────────────────────────────

export interface Floor {
  id: string;
  spaceId: string;
  name: string;
  level: number;
}

 // Validación geométrica de zonas/subsuelos
export { rectangulosSeIntersecan, rectanguloContenidoEn, detectarSolapamientoSubzona, calcularNivelAnidamientoRectangulo, zonaDbAMundo } from './validacionZonas';
 export type { RectanguloZona } from './validacionZonas';
export { normalizarTipoSubsueloZona, resolverTipoSubsueloZona } from './cerramientosZona';
export type { TipoSubsueloZona } from './cerramientosZona';

// ─── Espacio 3D (migrado desde components/space3d/*Runtime.ts) ───────────────
export * from './espacio3d';

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
