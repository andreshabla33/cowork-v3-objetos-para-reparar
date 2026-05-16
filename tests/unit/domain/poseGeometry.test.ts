/**
 * @file tests/unit/domain/poseGeometry.test.ts
 *
 * Tests del Domain PoseGeometry — funciones puras compartibles entre
 * apps/cowork-3d y apps/cowork-2d. Validan que la fórmula del audio gain
 * matchea el modelo "inverse" oficial del Web Audio API.
 *
 * Ref: ROADMAP_MONOREPO_PHASER4.md — Fase 0.2.
 */

import { describe, it, expect } from 'vitest';
import { pose2d, pose3d } from '@/src/core/domain/types/pose';
import {
  distance,
  distanceSquared,
  toAudioGain,
} from '@/src/core/domain/services/PoseGeometry';

describe('PoseGeometry · distance()', () => {
  it('distancia entre dos Pose3D iguales = 0', () => {
    const a = pose3d(1, 2, 3);
    const b = pose3d(1, 2, 3);
    expect(distance(a, b)).toBe(0);
  });

  it('distancia 3D usa los 3 ejes', () => {
    const a = pose3d(0, 0, 0);
    const b = pose3d(3, 4, 0);
    expect(distance(a, b)).toBe(5); // pythagorean triple
  });

  it('distancia 2D usa xy (ignora z)', () => {
    const a = pose2d(0, 0);
    const b = pose2d(3, 4);
    expect(distance(a, b)).toBe(5);
  });

  it('mix 3D ↔ 2D proyecta al plano XY (z del 2D = 0)', () => {
    const a = pose3d(0, 0, 0);
    const b = pose2d(3, 4);
    expect(distance(a, b)).toBe(5);
  });
});

describe('PoseGeometry · distanceSquared()', () => {
  it('coincide con distance() al cuadrado', () => {
    const a = pose3d(1, 2, 3);
    const b = pose3d(4, 6, 8);
    expect(distanceSquared(a, b)).toBeCloseTo(distance(a, b) ** 2, 10);
  });

  it('evita sqrt — más rápido para comparaciones contra umbral', () => {
    const a = pose2d(0, 0);
    const b = pose2d(10, 0);
    expect(distanceSquared(a, b)).toBe(100);
    expect(distanceSquared(a, b) < 121).toBe(true); // dentro de radio 11
  });
});

describe('PoseGeometry · toAudioGain()', () => {
  it('gain = 1.0 dentro de refDistance', () => {
    expect(toAudioGain(0, { refDistance: 1 })).toBe(1);
    expect(toAudioGain(0.5, { refDistance: 1 })).toBe(1);
    expect(toAudioGain(1, { refDistance: 1 })).toBe(1);
  });

  it('gain decae con la distancia (modelo inverse)', () => {
    // refDistance=1, rolloff=1, distance=3
    // gain = 1 / (1 + 1*(3-1)) = 1/3
    expect(toAudioGain(3, { refDistance: 1, rolloffFactor: 1 })).toBeCloseTo(1 / 3, 6);
  });

  it('gain = 0 más allá de maxDistance', () => {
    expect(toAudioGain(100, { refDistance: 1, maxDistance: 25 })).toBe(0);
    expect(toAudioGain(25, { refDistance: 1, maxDistance: 25 })).toBe(0);
  });

  it('rolloff alto hace caer más rápido', () => {
    const slow = toAudioGain(10, { refDistance: 1, rolloffFactor: 0.5 });
    const fast = toAudioGain(10, { refDistance: 1, rolloffFactor: 2 });
    expect(fast).toBeLessThan(slow);
  });

  it('refDistance <= 0 retorna 1 (degenerate, sin atenuar)', () => {
    expect(toAudioGain(100, { refDistance: 0 })).toBe(1);
    expect(toAudioGain(100, { refDistance: -1 })).toBe(1);
  });

  it('match con valores reales de SpatialAudio.tsx (REF=1, ROLLOFF=0.8, MAX=25)', () => {
    // Cerca: gain alto
    expect(toAudioGain(2, { refDistance: 1, maxDistance: 25, rolloffFactor: 0.8 }))
      .toBeCloseTo(1 / (1 + 0.8 * 1), 6); // ≈ 0.556

    // Lejos pero audible: gain bajo pero positivo
    const lejos = toAudioGain(15, { refDistance: 1, maxDistance: 25, rolloffFactor: 0.8 });
    expect(lejos).toBeGreaterThan(0);
    expect(lejos).toBeLessThan(0.15);

    // Más allá del máximo: silencio
    expect(toAudioGain(30, { refDistance: 1, maxDistance: 25, rolloffFactor: 0.8 })).toBe(0);
  });
});
