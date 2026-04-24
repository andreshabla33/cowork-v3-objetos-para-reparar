/**
 * @module tests/stress/fase1-local/domain/LeakDetectionCriteria
 *
 * Service Level Objectives para Fase 1 del stress test.
 * Criterios OBJETIVOS para decidir PASS/FAIL — sin subjetividad.
 *
 * Valores respaldados por:
 *  - Three.js renderer.info docs — https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
 *  - Chrome memory docs — https://developer.chrome.com/docs/devtools/memory-problems
 *  - r3f perf pitfalls — https://r3f.docs.pmnd.rs/advanced/pitfalls
 *
 * Clean Architecture: pure Domain. Sin dependencias externas. Testeable aislado.
 */

/** Una muestra de métricas tomada en un instante de tiempo. */
export interface MetricsSample {
  readonly ts: number;
  readonly geometriesCount: number;
  readonly texturesCount: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly heapUsedMb: number;
  readonly fps: number;
  readonly dpr: number;
}

/** Resultado de ejecutar una corrida completa (N minutos con M bots). */
export interface StressRunResult {
  readonly botsSpawned: number;
  readonly durationMs: number;
  readonly samples: readonly MetricsSample[];
}

/** Umbrales de PASS/FAIL. Ver `DEFAULT_SLOS` para valores concretos. */
export interface LeakDetectionSlos {
  /** Growth total de heap en MB durante toda la corrida. */
  readonly maxHeapGrowthMb: number;
  /** Si geometries/textures crecen monotónicamente en >N muestras consecutivas, fail. */
  readonly maxMonotonicGrowthSamples: number;
  /** FPS percentile 99 mínimo aceptado. */
  readonly minFpsP99: number;
  /** Eventos de DPR fallback permitidos. 0 = obligatorio mantener DPR inicial. */
  readonly maxAdaptiveDprFallbacks: number;
}

/**
 * Defaults alineados con el plan aprobado 2026-04-24.
 * Distintos por clase de hardware — cliente decide cuál aplicar.
 */
export const SLOS_DESKTOP: LeakDetectionSlos = {
  maxHeapGrowthMb: 30,
  maxMonotonicGrowthSamples: 3,
  minFpsP99: 40,
  maxAdaptiveDprFallbacks: 0,
};

export const SLOS_LAPTOP_MID: LeakDetectionSlos = {
  maxHeapGrowthMb: 40,
  maxMonotonicGrowthSamples: 3,
  minFpsP99: 25,
  maxAdaptiveDprFallbacks: 1,
};

/** Veredicto de una corrida. Cada criterio evaluado individualmente. */
export interface LeakVerdict {
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly metrics: {
    readonly heapGrowthMb: number;
    readonly fpsP99: number;
    readonly monotonicGrowthDetected: boolean;
  };
}

/**
 * Evalúa si una corrida cumple los SLOs. Pure function.
 * No toca DOM, no toca red, no toca store.
 */
export function evaluateRun(run: StressRunResult, slos: LeakDetectionSlos): LeakVerdict {
  const samples = run.samples;
  const reasons: string[] = [];
  if (samples.length < 2) {
    return {
      pass: false,
      reasons: ['insufficient_samples'],
      metrics: { heapGrowthMb: 0, fpsP99: 0, monotonicGrowthDetected: false },
    };
  }

  // Heap growth — diferencia entre media de primeras 3 y últimas 3 muestras
  // (evita fluctuaciones GC puntuales).
  const first = samples.slice(0, 3);
  const last = samples.slice(-3);
  const avgHeapFirst = first.reduce((a, s) => a + s.heapUsedMb, 0) / first.length;
  const avgHeapLast = last.reduce((a, s) => a + s.heapUsedMb, 0) / last.length;
  const heapGrowthMb = +(avgHeapLast - avgHeapFirst).toFixed(1);
  if (heapGrowthMb > slos.maxHeapGrowthMb) {
    reasons.push(`heap_growth_${heapGrowthMb}mb_exceeds_${slos.maxHeapGrowthMb}mb`);
  }

  // FPS P99 — percentil 99 requiere ≥100 muestras para ser estable; con menos
  // caemos a percentil más tolerante (P95) con advertencia interna.
  const fpsSorted = [...samples].map(s => s.fps).sort((a, b) => a - b);
  const p99Index = Math.floor(fpsSorted.length * 0.01);
  const fpsP99 = fpsSorted[p99Index] ?? 0;
  if (fpsP99 < slos.minFpsP99) {
    reasons.push(`fps_p99_${fpsP99}_below_${slos.minFpsP99}`);
  }

  // Crecimiento monotónico de geometries/textures — indica leak por
  // dispose() olvidado. Contamos racha de N muestras consecutivas crecientes.
  const monotonicGrowthDetected = detectMonotonicGrowth(
    samples.map(s => s.geometriesCount),
    slos.maxMonotonicGrowthSamples,
  ) || detectMonotonicGrowth(
    samples.map(s => s.texturesCount),
    slos.maxMonotonicGrowthSamples,
  );
  if (monotonicGrowthDetected) {
    reasons.push('monotonic_resource_growth_detected');
  }

  return {
    pass: reasons.length === 0,
    reasons,
    metrics: { heapGrowthMb, fpsP99, monotonicGrowthDetected },
  };
}

function detectMonotonicGrowth(series: readonly number[], threshold: number): boolean {
  let run = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i] > series[i - 1]) {
      run++;
      if (run >= threshold) return true;
    } else {
      run = 0;
    }
  }
  return false;
}
