/**
 * @module core/domain/entities
 * Entidades de Dominio para el sistema de Pisos y Subsuelos del espacio 3D.
 * Clean Architecture: Esta capa NO depende de frameworks ni librerías externas.
 */

export { FloorType, FLOOR_TYPE_CATEGORIES, FLOOR_TYPE_LABELS, TIPOS_SUELO, esTipoSueloValido, normalizarTipoSuelo } from './tiposSuelo';

// Validación geométrica de zonas/subsuelos
export { rectangulosSeIntersecan, rectanguloContenidoEn, detectarSolapamientoSubzona, calcularNivelAnidamientoRectangulo, zonaDbAMundo } from './validacionZonas';
export type { RectanguloZona } from './validacionZonas';
export { normalizarTipoSubsueloZona, resolverTipoSubsueloZona } from './cerramientosZona';
export type { TipoSubsueloZona } from './cerramientosZona';

// ─── Espacio 3D (migrado desde components/space3d/*Runtime.ts) ───────────────
export * from './espacio3d';
