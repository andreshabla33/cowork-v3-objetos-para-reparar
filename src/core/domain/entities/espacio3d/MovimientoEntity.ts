/**
 * @module domain/entities/espacio3d/MovimientoEntity
 *
 * Lógica pura de dominio para resolución de movimiento con deslizamiento.
 * Clean Architecture: capa de dominio — cero dependencias externas.
 *
 * Migrado desde: components/space3d/movimientoRuntime.ts
 */

import type { Posicion2D } from './AsientoEntity';

// ─── Value Objects ────────────────────────────────────────────────────────────

export interface MovimientoIntento3D {
  dx: number;
  dz: number;
}

export interface MovimientoResuelto3D {
  posicion: Posicion2D;
  seMovio: boolean;
  colisionX: boolean;
  colisionZ: boolean;
}

/**
 * Bounds del mundo caminable en coordenadas de mundo.
 *
 * Refactor 2026-04-21: antes el clamp era `[0, worldSize]` fijo. El terreno
 * visual tiene un offset (`TERRAIN_OFFSET_X/Z` en Scene3D), por lo que el
 * dominio lógico quedaba desalineado con la superficie visible: el avatar
 * podía atorarse contra un borde invisible aunque el grid siguiera. Ahora
 * la Presentation deriva los bounds reales del `terrainBounds` y los pasa
 * al dominio.
 */
export interface MovementBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

// ─── Función de dominio pura ──────────────────────────────────────────────────

const clamp = (valor: number, minimo: number, maximo: number): number =>
  Math.max(minimo, Math.min(maximo, valor));

/**
 * Resuelve un intento de movimiento con deslizamiento en ejes X/Z.
 * Si el movimiento completo colisiona, intenta mover solo en X, luego solo en Z.
 *
 * @param posicionActual  - Posición 2D actual del avatar
 * @param movimiento      - Intento de movimiento (delta X y Z)
 * @param bounds          - Límites caminables en world coordinates
 * @param esPosicionValida - Predicado que devuelve true si (x,z) es transitable
 */
export const resolverMovimientoConDeslizamiento = ({
  posicionActual,
  movimiento,
  bounds,
  esPosicionValida,
}: {
  posicionActual: Posicion2D;
  movimiento: MovimientoIntento3D;
  bounds: MovementBounds;
  esPosicionValida: (x: number, z: number) => boolean;
}): MovimientoResuelto3D => {
  const destinoCompleto: Posicion2D = {
    x: clamp(posicionActual.x + movimiento.dx, bounds.minX, bounds.maxX),
    z: clamp(posicionActual.z + movimiento.dz, bounds.minZ, bounds.maxZ),
  };

  if (esPosicionValida(destinoCompleto.x, destinoCompleto.z)) {
    return {
      posicion: destinoCompleto,
      seMovio: destinoCompleto.x !== posicionActual.x || destinoCompleto.z !== posicionActual.z,
      colisionX: false,
      colisionZ: false,
    };
  }

  const destinoSoloX: Posicion2D = {
    x: clamp(posicionActual.x + movimiento.dx, bounds.minX, bounds.maxX),
    z: posicionActual.z,
  };

  if (movimiento.dx !== 0 && esPosicionValida(destinoSoloX.x, destinoSoloX.z)) {
    return {
      posicion: destinoSoloX,
      seMovio: destinoSoloX.x !== posicionActual.x,
      colisionX: false,
      colisionZ: movimiento.dz !== 0,
    };
  }

  const destinoSoloZ: Posicion2D = {
    x: posicionActual.x,
    z: clamp(posicionActual.z + movimiento.dz, bounds.minZ, bounds.maxZ),
  };

  if (movimiento.dz !== 0 && esPosicionValida(destinoSoloZ.x, destinoSoloZ.z)) {
    return {
      posicion: destinoSoloZ,
      seMovio: destinoSoloZ.z !== posicionActual.z,
      colisionX: movimiento.dx !== 0,
      colisionZ: false,
    };
  }

  return {
    posicion: posicionActual,
    seMovio: false,
    colisionX: movimiento.dx !== 0,
    colisionZ: movimiento.dz !== 0,
  };
};
