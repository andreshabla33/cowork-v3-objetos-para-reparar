/**
 * @module domain/services/PoseGeometry
 *
 * Funciones puras de geometría sobre `Pose` (2D | 3D). Sin dependencias
 * de Three.js, Phaser ni Web Audio API — solo TS puro.
 *
 * Diseñadas para ser reutilizadas por:
 *   - `apps/cowork-3d`: proximidad, audio espacial, frustum hints.
 *   - `apps/cowork-2d`: idem, con coords planares del tilemap.
 *
 * Las funciones se comportan correctamente para mezclas (un Pose3D y un
 * Pose2D coexisten ignorando la dimensión faltante — el caller decide la
 * semántica del cross-mode). Mismo modelo de atenuación que `PannerNode`
 * con `distanceModel: 'inverse'`.
 *
 * Ref:
 *  - Web Audio API PannerNode distance models —
 *    https://www.w3.org/TR/webaudio/#panner-algorithm
 *  - Glenn Fiedler — Networked Physics / Snapshot Interpolation
 *  - ROADMAP_MONOREPO_PHASER4.md — Fase 0.2
 */

import { is3d, type Pose } from '../types/pose';

/**
 * Distancia euclidiana entre dos poses. Para mezclas 2D ↔ 3D, el componente
 * Z faltante se asume 0 (proyección al plano XY del mundo).
 */
export const distance = (a: Pose, b: Pose): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const az = is3d(a) ? a.z : 0;
  const bz = is3d(b) ? b.z : 0;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Cuadrado de la distancia (evita sqrt cuando solo se necesita comparar
 * contra un umbral). Útil en loops calientes.
 */
export const distanceSquared = (a: Pose, b: Pose): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const az = is3d(a) ? a.z : 0;
  const bz = is3d(b) ? b.z : 0;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
};

export interface AudioGainParams {
  /** Distancia (en unidades de mundo) por debajo de la cual gain = 1.0. */
  readonly refDistance: number;
  /**
   * Distancia máxima audible. Más allá, gain = 0. Default = +Infinity
   * (atenuación continua sin corte).
   */
  readonly maxDistance?: number;
  /** Exponente del modelo inverso. Default 1.0 (PannerNode default). */
  readonly rolloffFactor?: number;
}

/**
 * Gain por distancia con el modelo "inverse" del Web Audio API.
 *
 *   gain = refDistance / (refDistance + rolloff * max(0, distance - refDistance))
 *
 * - `distance < refDistance` → gain = 1.0 (sin atenuación).
 * - `distance >= maxDistance` → gain = 0 (silencio absoluto).
 * - El rolloff alto hace caer la atenuación más rápido.
 *
 * Devuelve un valor en `[0, 1]`. Aplicarlo directamente a un `GainNode.gain`
 * o multiplicarlo por el master volume del jugador.
 */
export const toAudioGain = (distance: number, params: AudioGainParams): number => {
  const { refDistance, maxDistance = Number.POSITIVE_INFINITY, rolloffFactor = 1 } = params;
  if (refDistance <= 0) return 1;
  if (distance <= refDistance) return 1;
  if (distance >= maxDistance) return 0;
  return refDistance / (refDistance + rolloffFactor * (distance - refDistance));
};
