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
  MovementBounds,
} from '../../../core/domain/entities/espacio3d/MovimientoEntity';
import type { ObstaculoColision3D } from '../../../core/domain/entities/espacio3d/ColisionEntity';
import { esPosicionTransitable } from '../../../core/domain/entities/espacio3d/ColisionEntity';
import type { Posicion2D } from '../../../core/domain/entities/espacio3d/AsientoEntity';

// ─── Parámetros ───────────────────────────────────────────────────────────────

export interface ResolverMovimientoParams {
  posicionActual: Posicion2D;
  movimiento: MovimientoIntento3D;
  /**
   * Bounds caminables en world coords. Si no se pasa, se asume
   * `[0, worldSize]` para backwards-compat con callers que usaban
   * `worldSize` plano (refactor 2026-04-21).
   */
  bounds?: MovementBounds;
  /** @deprecated Usar `bounds` — se mantiene por compat. Si llega, se convierte a `{0..worldSize}`. */
  worldSize?: number;
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

  const bounds: MovementBounds = params.bounds ?? {
    minX: 0,
    maxX: params.worldSize ?? 100,
    minZ: 0,
    maxZ: params.worldSize ?? 100,
  };

  return resolverMovimientoConDeslizamiento({
    posicionActual: params.posicionActual,
    movimiento: params.movimiento,
    bounds,
    esPosicionValida,
  });
};

// Re-exports para consumidores de presentación
export type { MovimientoIntento3D, MovimientoResuelto3D };
