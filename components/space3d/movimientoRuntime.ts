import type { Posicion3DPlano } from './asientosRuntime';

export interface MovimientoIntento3D {
  dx: number;
  dz: number;
}

export interface MovimientoResuelto3D {
  posicion: Posicion3DPlano;
  seMovio: boolean;
  colisionX: boolean;
  colisionZ: boolean;
}

interface ResolverMovimiento3DParams {
  posicionActual: Posicion3DPlano;
  movimiento: MovimientoIntento3D;
  worldSize: number;
  esPosicionValida: (x: number, z: number) => boolean;
}

const clamp = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, valor));

export const resolverMovimientoConDeslizamiento = ({
  posicionActual,
  movimiento,
  worldSize,
  esPosicionValida,
}: ResolverMovimiento3DParams): MovimientoResuelto3D => {
  const destinoCompleto = {
    x: clamp(posicionActual.x + movimiento.dx, 0, worldSize),
    z: clamp(posicionActual.z + movimiento.dz, 0, worldSize),
  };

  if (esPosicionValida(destinoCompleto.x, destinoCompleto.z)) {
    return {
      posicion: destinoCompleto,
      seMovio: destinoCompleto.x !== posicionActual.x || destinoCompleto.z !== posicionActual.z,
      colisionX: false,
      colisionZ: false,
    };
  }

  const destinoSoloX = {
    x: clamp(posicionActual.x + movimiento.dx, 0, worldSize),
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

  const destinoSoloZ = {
    x: posicionActual.x,
    z: clamp(posicionActual.z + movimiento.dz, 0, worldSize),
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
