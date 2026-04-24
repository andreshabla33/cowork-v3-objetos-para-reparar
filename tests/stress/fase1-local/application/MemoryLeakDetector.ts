/**
 * @module tests/stress/fase1-local/application/MemoryLeakDetector
 *
 * Colector de métricas + evaluador de SLOs.
 *
 * Clean Architecture:
 *   - Depende de Domain (MetricsSample, evaluateRun) y un port IMetricsProbe.
 *   - No toca Three.js ni Chrome APIs directamente — eso es Infrastructure.
 */

import type { MetricsSample, StressRunResult, LeakDetectionSlos, LeakVerdict } from '../domain/LeakDetectionCriteria';
import { evaluateRun } from '../domain/LeakDetectionCriteria';

/** Port para obtener una muestra instantánea de métricas. Infrastructure lo implementa. */
export interface IMetricsProbe {
  sample(): MetricsSample;
}

export class MemoryLeakDetector {
  private samples: MetricsSample[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private startTs: number = 0;

  constructor(
    private readonly probe: IMetricsProbe,
    private readonly sampleIntervalMs: number = 5000,
  ) {}

  /** Comienza muestreo cada N ms. No-op si ya está corriendo. */
  start(): void {
    if (this.intervalHandle !== null) return;
    this.samples = [];
    this.startTs = Date.now();
    // Muestra inmediata al iniciar (no esperar al primer interval tick).
    this.samples.push(this.probe.sample());
    this.intervalHandle = setInterval(() => {
      this.samples.push(this.probe.sample());
    }, this.sampleIntervalMs);
  }

  /** Detiene muestreo. Retorna el resultado de la corrida (si había bots). */
  stop(botCount: number): StressRunResult {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    // Muestra final al detener.
    this.samples.push(this.probe.sample());
    return {
      botsSpawned: botCount,
      durationMs: Date.now() - this.startTs,
      samples: this.samples,
    };
  }

  /** Evalúa el resultado contra los SLOs dados. */
  evaluate(result: StressRunResult, slos: LeakDetectionSlos): LeakVerdict {
    return evaluateRun(result, slos);
  }

  /** Acceso read-only al buffer actual para UI live. */
  currentSamples(): readonly MetricsSample[] {
    return this.samples;
  }
}
