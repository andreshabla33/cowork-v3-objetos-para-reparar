/**
 * @module application/usecases/ResolverMovimientoUseCase
 *
 * Caso de uso: Resuelve el movimiento del avatar con deslizamiento y límites.
 * Orquesta MovimientoEntity + ColisionEntity del dominio.
 *
 * Clean Architecture:
 *  - Sin React, Three.js ni Supabase.
 *  - Totalmente testeable con mocks de predicado de colisión.
 */

import {
  resolverMovimientoConDeslizamiento,
} from '../../../core/domain/entities/espacio3d/MovimientoEntity';
import type {
  MovimientoIntento3D,
  MovimientoResuelto3D,
} from '../../../core/domain/entities/espacio3d/MovimientoEntity';
import type { ObstaculoColision3D } from '../../../core/domain/entities/espacio3d/ColisionEntity';
import { esPosicionTransitable } from '../../../core/domain/entities/espacio3d/ColisionEntity';
import type { Posicion2D } from '../../../core/domain/entities/espacio3d/AsientoEntity';

// ─── Parámetros ───────────────────────────────────────────────────────────────

export interface ResolverMovimientoParams {
  posicionActual: Posicion2D;
  movimiento: MovimientoIntento3D;
  worldSize: number;
  obstaculos: ObstaculoColision3D[];
  radioJugador: number;
  idsObstaculosIgnorados?: string[];
}

// ─── Use Case ─────────────────────────────────────────────────────────────────

/**
 * Resuelve el movimiento completo del avatar:
 *  1. Intenta movimiento completo (dx + dz)
 *  2. Si colisiona, intenta solo dx (deslizamiento lateral)
 *  3. Si colisiona, intenta solo dz (deslizamiento frontal)
 *  4. Si colisiona todo, permanece en posición actual
 *
 * @returns MovimientoResuelto3D con la nueva posición y flags de colisión
 */
export const resolverMovimientoAvatar = (
  params: ResolverMovimientoParams,
): MovimientoResuelto3D => {
  const idsIgnorados = params.idsObstaculosIgnorados ?? [];

  const esPosicionValida = (x: number, z: number): boolean =>
    esPosicionTransitable(
      { x, z },
      params.obstaculos,
      params.radioJugador,
      idsIgnorados,
    );

  return resolverMovimientoConDeslizamiento({
    posicionActual: params.posicionActual,
    movimiento: params.movimiento,
    worldSize: params.worldSize,
    esPosicionValida,
  });
};

// Re-exports para consumidores de presentación
export type { MovimientoIntento3D, MovimientoResuelto3D };
