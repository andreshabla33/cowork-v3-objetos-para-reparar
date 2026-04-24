/**
 * @module tests/stress/fase1-local/infrastructure/ThreeRendererMetricsProbe
 *
 * Implementa IMetricsProbe leyendo del WebGLRenderer de Three.js + Chrome APIs.
 *
 * Fuentes oficiales:
 *   - `renderer.info`: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
 *   - `performance.memory`: https://developer.chrome.com/docs/devtools/memory-problems
 *   - FPS: medido con delta entre frames (estándar)
 *
 * Clean Architecture: Infrastructure — depende de Three.js concreto + Chrome API.
 */

import type * as THREE from 'three';
import type { IMetricsProbe } from '../application/MemoryLeakDetector';
import type { MetricsSample } from '../domain/LeakDetectionCriteria';

/** `performance.memory` es Chrome-only y no está en el typing estándar de DOM. */
interface ChromePerformanceMemory {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: ChromePerformanceMemory;
}

export class ThreeRendererMetricsProbe implements IMetricsProbe {
  /**
   * @param rendererGetter — closure que retorna el renderer actual. Callback
   *   porque el renderer de r3f puede cambiar (Canvas remount). No guardar ref.
   * @param fpsGetter — callback que retorna FPS actual (mantenido externamente
   *   por el useFrame del panel — se actualiza al cálculo típico 1/delta).
   * @param dprGetter — DPR actual del gl renderer.
   */
  constructor(
    private readonly rendererGetter: () => THREE.WebGLRenderer | null,
    private readonly fpsGetter: () => number,
    private readonly dprGetter: () => number,
  ) {}

  sample(): MetricsSample {
    const renderer = this.rendererGetter();
    const perf = performance as PerformanceWithMemory;
    const heapBytes = perf.memory?.usedJSHeapSize ?? 0;
    return {
      ts: Date.now(),
      geometriesCount: renderer?.info.memory.geometries ?? 0,
      texturesCount: renderer?.info.memory.textures ?? 0,
      drawCalls: renderer?.info.render.calls ?? 0,
      triangles: renderer?.info.render.triangles ?? 0,
      heapUsedMb: +(heapBytes / (1024 * 1024)).toFixed(1),
      fps: this.fpsGetter(),
      dpr: this.dprGetter(),
    };
  }
}
