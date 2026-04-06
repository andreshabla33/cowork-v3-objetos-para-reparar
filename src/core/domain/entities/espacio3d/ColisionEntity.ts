/**
 * @module domain/entities/espacio3d/ColisionEntity
 *
 * Entidades y lógica pura de dominio para detección de colisiones 3D.
 * Clean Architecture: capa de dominio — sin React, Three.js ni Supabase.
 *
 * Migrado desde: components/space3d/colisionesRuntime.ts
 */

import type { Posicion2D } from './AsientoEntity';

// ─── Value Objects ────────────────────────────────────────────────────────────

export interface ObstaculoColision3D {
  id: string;
  tipo: 'escritorio' | 'objeto_persistente';
  posicion: { x: number; y: number; z: number };
  semiextensiones: { x: number; y: number; z: number };
  rotacion: number;
  padding: number;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

const clampColision = (valor: number, minimo: number, maximo: number): number =>
  Math.max(minimo, Math.min(maximo, valor));

const convertirAPosicionLocal = (
  posicion: Posicion2D,
  obstaculo: ObstaculoColision3D,
): Posicion2D => {
  const dx = posicion.x - obstaculo.posicion.x;
  const dz = posicion.z - obstaculo.posicion.z;
  const cos = Math.cos(-obstaculo.rotacion);
  const sin = Math.sin(-obstaculo.rotacion);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
};

// ─── Funciones de dominio puras ───────────────────────────────────────────────

/** Comprueba si el jugador colisiona con un obstáculo (AABB rotado) */
export const colisionaJugadorConObstaculo = (
  posicion: Posicion2D,
  radioJugador: number,
  obstaculo: ObstaculoColision3D,
  idsIgnorados: Set<string> = new Set(),
): boolean => {
  if (idsIgnorados.has(obstaculo.id)) return false;

  const local = convertirAPosicionLocal(posicion, obstaculo);
  const radioColision = radioJugador + obstaculo.padding;
  const limiteX = obstaculo.semiextensiones.x;
  const limiteZ = obstaculo.semiextensiones.z;
  const puntoMasCercanoX = clampColision(local.x, -limiteX, limiteX);
  const puntoMasCercanoZ = clampColision(local.z, -limiteZ, limiteZ);
  const deltaX = local.x - puntoMasCercanoX;
  const deltaZ = local.z - puntoMasCercanoZ;

  return (deltaX * deltaX) + (deltaZ * deltaZ) < (radioColision * radioColision);
};

/** Comprueba si una posición es transitable (sin colisiones) */
export const esPosicionTransitable = (
  posicion: Posicion2D,
  obstaculos: ObstaculoColision3D[],
  radioJugador: number,
  idsIgnorados: string[] = [],
): boolean => {
  const ignorados = new Set(idsIgnorados);
  return !obstaculos.some((o) => colisionaJugadorConObstaculo(posicion, radioJugador, o, ignorados));
};

/** Construye un obstáculo de colisión básico desde propiedades calculadas */
export const construirObstaculoBase = (params: {
  id: string;
  tipo: 'escritorio' | 'objeto_persistente';
  posicion: { x: number; y: number; z: number };
  semiextensiones: { x: number; y: number; z: number };
  rotacion: number;
  padding: number;
}): ObstaculoColision3D => ({
  id: params.id,
  tipo: params.tipo,
  posicion: params.posicion,
  semiextensiones: {
    x: Math.max(params.semiextensiones.x, 0.01),
    y: Math.max(params.semiextensiones.y, 0.01),
    z: Math.max(params.semiextensiones.z, 0.01),
  },
  rotacion: params.rotacion,
  padding: params.padding,
});

/** Construye un segmento de obstáculo para pared con abertura */
export const construirObstaculoSegmentado = (params: {
  id: string;
  posicionBase: { x: number; y: number; z: number };
  rotacion: number;
  centroLocalX: number;
  centroLocalY: number;
  ancho: number;
  alto: number;
  profundidad: number;
  padding: number;
}): ObstaculoColision3D => {
  const cos = Math.cos(params.rotacion);
  const sin = Math.sin(params.rotacion);

  return construirObstaculoBase({
    id: params.id,
    tipo: 'objeto_persistente',
    posicion: {
      x: params.posicionBase.x + params.centroLocalX * cos,
      y: params.posicionBase.y + params.centroLocalY,
      z: params.posicionBase.z + params.centroLocalX * sin,
    },
    semiextensiones: {
      x: params.ancho / 2,
      y: params.alto / 2,
      z: params.profundidad / 2,
    },
    rotacion: params.rotacion,
    padding: params.padding,
  });
};
