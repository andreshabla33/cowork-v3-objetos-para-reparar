/**
 * @module tests/stress/fase1-local/domain/BaselineComparison
 *
 * Pure domain para detección de regresión entre un run nuevo y su baseline.
 * Compara métricas clave y emite un veredicto con la lista de regresiones.
 *
 * Política: una regresión es cualquier métrica que empeoró más del threshold
 * configurado (default: 15% worse). "Worse" depende de la dirección de la
 * métrica (FPS: menor = peor; heap: mayor = peor; counts: mayor = peor).
 *
 * Ref: https://grafana.com/docs/k6/latest/using-k6/thresholds/
 */

import type { LeakVerdict } from './LeakDetectionCriteria';

export interface BaselineSnapshot {
  readonly profile: string;
  readonly capturedAt: string;
  readonly gitCommit: string | null;
  readonly verdict: LeakVerdict;
}

export interface RegressionThresholds {
  /** % máximo de empeoramiento aceptado por métrica. Default 15. */
  readonly maxWorsePct: number;
  /** Delta absoluto mínimo para considerar regresión (evita ruido en valores chicos). */
  readonly minAbsoluteDelta: {
    readonly fps: number;
    readonly heapMb: number;
  };
}

export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  maxWorsePct: 15,
  minAbsoluteDelta: { fps: 2, heapMb: 2 },
};

export interface MetricComparison {
  readonly metric: string;
  readonly baseline: number;
  readonly current: number;
  readonly deltaAbsolute: number;
  readonly deltaPct: number;
  readonly regressed: boolean;
  readonly direction: 'higher_is_better' | 'lower_is_better';
}

export interface BaselineVerdict {
  readonly passed: boolean;
  readonly comparisons: readonly MetricComparison[];
  readonly regressions: readonly MetricComparison[];
}

/**
 * Compara el veredicto actual contra el baseline. Pure function.
 */
export function compareToBaseline(
  current: LeakVerdict,
  baseline: BaselineSnapshot,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS,
): BaselineVerdict {
  const b = baseline.verdict.metrics;
  const c = current.metrics;

  const comparisons: MetricComparison[] = [
    makeComparison('fpsP99', b.fpsP99, c.fpsP99, 'higher_is_better', thresholds, thresholds.minAbsoluteDelta.fps),
    makeComparison('fpsP95', b.fpsP95, c.fpsP95, 'higher_is_better', thresholds, thresholds.minAbsoluteDelta.fps),
    makeComparison('fpsMedian', b.fpsMedian, c.fpsMedian, 'higher_is_better', thresholds, thresholds.minAbsoluteDelta.fps),
    makeComparison('heapGrowthMb', b.heapGrowthMb, c.heapGrowthMb, 'lower_is_better', thresholds, thresholds.minAbsoluteDelta.heapMb),
  ];

  const regressions = comparisons.filter((x) => x.regressed);
  return {
    passed: regressions.length === 0,
    comparisons,
    regressions,
  };
}

function makeComparison(
  metric: string,
  baseline: number,
  current: number,
  direction: 'higher_is_better' | 'lower_is_better',
  thresholds: RegressionThresholds,
  minAbsoluteDelta: number,
): MetricComparison {
  const deltaAbsolute = +(current - baseline).toFixed(2);
  const deltaPct = baseline === 0 ? 0 : +((deltaAbsolute / Math.abs(baseline)) * 100).toFixed(1);

  let regressed = false;
  if (Math.abs(deltaAbsolute) >= minAbsoluteDelta) {
    if (direction === 'higher_is_better') {
      // current < baseline es peor.
      regressed = deltaPct < -thresholds.maxWorsePct;
    } else {
      // current > baseline es peor.
      regressed = deltaPct > thresholds.maxWorsePct;
    }
  }

  return { metric, baseline, current, deltaAbsolute, deltaPct, regressed, direction };
}
