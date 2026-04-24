/**
 * @module tests/stress/fase1-local/domain/LoadProfiles
 *
 * Perfiles de carga canónicos del Test Pyramid para stress testing.
 * Cada profile describe forma temporal de la carga (static / ramp / spike)
 * + SLOs específicos + sampling rate.
 *
 * Alineado con Grafana k6 test types oficiales:
 *   https://grafana.com/docs/k6/latest/testing-guides/test-types/
 *
 * Clean Architecture: pure Domain. Consumido por LoadProfileExecutor (Application)
 * que los traduce en llamadas a BotSpawnerUseCase.
 */

import type { LeakDetectionSlos } from './LeakDetectionCriteria';
import { SLOS_DESKTOP, SLOS_LAPTOP_MID } from './LeakDetectionCriteria';

export type LoadProfileKind = 'smoke' | 'load' | 'soak' | 'stress' | 'spike';

/** Carga estática (N bots fijos durante durationSec). */
export interface StaticLoadShape {
  readonly kind: 'static';
  readonly botCount: number;
  readonly durationSec: number;
}

/** Ramp-up escalonado (fromBots → toBots en pasos de stepBots cada stepDurationSec). */
export interface RampLoadShape {
  readonly kind: 'ramp';
  readonly fromBots: number;
  readonly toBots: number;
  readonly stepBots: number;
  readonly stepDurationSec: number;
  readonly holdAtMaxSec: number;
}

/** Spike: baseline estable + burst corto a spikeBots. */
export interface SpikeLoadShape {
  readonly kind: 'spike';
  readonly baselineBots: number;
  readonly spikeBots: number;
  readonly baselineBeforeSec: number;
  readonly spikeDurationSec: number;
  readonly baselineAfterSec: number;
}

export type LoadShape = StaticLoadShape | RampLoadShape | SpikeLoadShape;

export interface LoadProfile {
  readonly kind: LoadProfileKind;
  readonly description: string;
  readonly shape: LoadShape;
  /** Intervalo de sampling en ms. 1000ms da 300 muestras en load profile (P99 estable). */
  readonly samplingIntervalMs: number;
  readonly slos: LeakDetectionSlos;
  /** Nombre de baseline a comparar (típicamente === kind). */
  readonly baselineName: string;
}

/**
 * SLOs ajustados por profile. Smoke tolerante (solo sanity), soak más laxo
 * (leaks esperados en 2h son normales hasta cierto punto), spike más estricto
 * (el salto no debe romper nada).
 */
const SLOS_SMOKE: LeakDetectionSlos = {
  maxHeapGrowthMb: 10,
  maxMonotonicGrowthSamples: 10,
  minFpsP99: 30,
  maxAdaptiveDprFallbacks: 1,
};

const SLOS_SOAK: LeakDetectionSlos = {
  maxHeapGrowthMb: 80,
  maxMonotonicGrowthSamples: 5,
  minFpsP99: 35,
  maxAdaptiveDprFallbacks: 2,
};

const SLOS_STRESS: LeakDetectionSlos = {
  maxHeapGrowthMb: 100,
  maxMonotonicGrowthSamples: 8,
  minFpsP99: 20,
  maxAdaptiveDprFallbacks: 3,
};

const SLOS_SPIKE: LeakDetectionSlos = {
  maxHeapGrowthMb: 20,
  maxMonotonicGrowthSamples: 3,
  minFpsP99: 30,
  maxAdaptiveDprFallbacks: 1,
};

export const PROFILES: Record<LoadProfileKind, LoadProfile> = {
  smoke: {
    kind: 'smoke',
    description: 'Sanity check — 5 bots × 30s. Valida pipeline antes de tests reales.',
    shape: { kind: 'static', botCount: 5, durationSec: 30 },
    samplingIntervalMs: 1000,
    slos: SLOS_SMOKE,
    baselineName: 'smoke',
  },
  load: {
    kind: 'load',
    description: 'Steady state — 50 bots × 5min. Valida SLOs bajo carga típica.',
    shape: { kind: 'static', botCount: 50, durationSec: 300 },
    samplingIntervalMs: 1000,
    slos: SLOS_DESKTOP,
    baselineName: 'load',
  },
  soak: {
    kind: 'soak',
    description: 'Leak detection — 50 bots × 2h. Detecta leaks lentos que load no captura.',
    shape: { kind: 'static', botCount: 50, durationSec: 7200 },
    samplingIntervalMs: 5000,
    slos: SLOS_SOAK,
    baselineName: 'soak',
  },
  stress: {
    kind: 'stress',
    description: 'Breaking point — ramp 10→200 bots (step 10 × 30s) + hold 60s.',
    shape: {
      kind: 'ramp',
      fromBots: 10,
      toBots: 200,
      stepBots: 10,
      stepDurationSec: 30,
      holdAtMaxSec: 60,
    },
    samplingIntervalMs: 1000,
    slos: SLOS_STRESS,
    baselineName: 'stress',
  },
  spike: {
    kind: 'spike',
    description: 'Burst tolerance — 20 bots steady, salto a 100 × 10s, vuelta a 20.',
    shape: {
      kind: 'spike',
      baselineBots: 20,
      spikeBots: 100,
      baselineBeforeSec: 60,
      spikeDurationSec: 10,
      baselineAfterSec: 60,
    },
    samplingIntervalMs: 1000,
    slos: SLOS_SPIKE,
    baselineName: 'spike',
  },
};

/** Devuelve el profile laptop-tier para el mismo kind. Solo aplica a load/stress. */
export function toLaptopProfile(profile: LoadProfile): LoadProfile {
  if (profile.kind === 'load') {
    return { ...profile, slos: SLOS_LAPTOP_MID, baselineName: 'load-laptop' };
  }
  return profile;
}

/** Duración total estimada de un profile (sum de fases). */
export function totalDurationSec(profile: LoadProfile): number {
  const s = profile.shape;
  if (s.kind === 'static') return s.durationSec;
  if (s.kind === 'ramp') {
    const steps = Math.ceil((s.toBots - s.fromBots) / s.stepBots);
    return steps * s.stepDurationSec + s.holdAtMaxSec;
  }
  // spike
  return s.baselineBeforeSec + s.spikeDurationSec + s.baselineAfterSec;
}

/** Máxima cantidad de bots que alcanzará el profile. */
export function peakBotCount(profile: LoadProfile): number {
  const s = profile.shape;
  if (s.kind === 'static') return s.botCount;
  if (s.kind === 'ramp') return s.toBots;
  return s.spikeBots;
}
