/**
 * @module domain/entities/espacio3d/PisoDecorativo
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Pisos decorativos (alfombras / parches de material) que admin pinta sobre
 * el suelo del espacio o dentro de una zona-empresa. Render plano (Y≈0.01)
 * con un `FloorType` reusando el sistema de materiales PBR existente.
 *
 * Modelo Gather-style: rectángulo en world coords (centro + ancho/profundidad
 * + rotación Y). `zona_id` nullable permite decorar también el suelo de la
 * zona "Principal" (suelo común del espacio, sin zona-empresa asociada).
 */

import type { FloorType } from '../tiposSuelo';

export interface PisoDecorativo {
  readonly id: string;
  readonly espacioId: string;
  /** `null` = decoración sobre el suelo principal (fuera de zonas-empresa). */
  readonly zonaId: string | null;
  readonly tipoSuelo: FloorType;
  readonly centroX: number;
  readonly centroZ: number;
  readonly ancho: number;
  readonly profundidad: number;
  /** Radianes alrededor de Y. */
  readonly rotacionY: number;
  /** Z-order al apilar múltiples decoraciones en la misma área. */
  readonly orden: number;
  readonly ownerId: string | null;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface CrearPisoDecorativoInput {
  espacioId: string;
  zonaId: string | null;
  tipoSuelo: FloorType;
  centroX: number;
  centroZ: number;
  ancho: number;
  profundidad: number;
  rotacionY?: number;
  orden?: number;
}

/** Y offset world del piso decorativo sobre el suelo base. */
export const PISO_DECORATIVO_Y_OFFSET = 0.01;
