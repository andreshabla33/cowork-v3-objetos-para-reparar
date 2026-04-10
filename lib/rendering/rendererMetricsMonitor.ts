/**
 * @module lib/rendering/rendererMetricsMonitor
 *
 * Monitor de métricas de renderizado que evalúa la salud del frame
 * contra los umbrales definidos en el dominio (IRenderingOptimizationService).
 *
 * Conecta el logging existente de renderer-metrics con el use case de optimización.
 *
 * Problema detectado en logs:
 *   calls: 652 | triangles: 737,104 | geometries: 312-567 | programs: 28-32
 *
 * Clean Architecture: capa de infraestructura — importa Three.js y el use case.
 * Garantía del boundary: todo valor que cruza al dominio es un `number` finito.
 * La sanitización defensiva protege contra particularidades de renderers exóticos
 * (p. ej. WebGPURenderer en frame 0 devuelve `Infinity` para `render.triangles`
 * mientras la primera compute pass aún no se ha completado — Three.js r170).
 *
 * Ref CLEAN-ARCH-F5: integrado en el hook useRendererMetrics.
 * Ref HOTFIX-RENDERER-METRICS-WEBGPU-INFINITY-2026-04-10.
 * Ref Three.js docs — https://threejs.org/docs/#api/en/renderers/WebGPURenderer
 *   ("First frame may show incomplete data; WebGPU may defer pipeline creation")
 */

import type { Scene, WebGLRenderer } from 'three';
import {
  OptimizarRenderizadoUseCase,
  UMBRALES_RENDERIZADO,
} from '../../src/core/application/usecases/OptimizarRenderizadoUseCase';
import type { MetricasRenderizado } from '../../src/core/domain/ports/IRenderingOptimizationService';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ResultadoEvaluacionFrame {
  saludable: boolean;
  alertas: string[];
  metricas: MetricasRenderizado;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Garantiza que el valor que cruza la frontera al dominio sea un `number` finito.
 *
 * Por qué: `WebGPURenderer.info.render.triangles` puede devolver `Infinity` o
 * `NaN` en frame 0 (antes de que WebGPU complete la primera compute/render pass)
 * y `JSON.stringify(Infinity)` → `"null"`, lo que rompe el logging estructurado
 * y dispara falsas alertas en el dominio (`Infinity > cualquierUmbral`).
 *
 * Ref HOTFIX-RENDERER-METRICS-WEBGPU-INFINITY-2026-04-10.
 */
const toFiniteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

// ─── Monitor ──────────────────────────────────────────────────────────────────

/**
 * Extrae métricas del WebGLRenderer y las evalúa.
 * Llamar desde useFrame o en el callback de PerformanceMonitor.
 *
 * @example
 * // En un componente R3F:
 * const { gl } = useThree();
 * useFrame(() => {
 *   const resultado = evaluarFrameRenderer(gl, gpuTier);
 *   if (!resultado.saludable) console.warn(resultado.alertas);
 * });
 */
export const evaluarFrameRenderer = (
  renderer: WebGLRenderer,
  gpuTier: number,
  scene?: Scene,
): ResultadoEvaluacionFrame => {
  const info = renderer.info;

  // Sanitización defensiva en el boundary Infrastructure→Domain.
  // Todo valor no-finito (Infinity, NaN, undefined) colapsa a 0.
  const metricas: MetricasRenderizado = {
    drawCalls: toFiniteNumber(info.render.calls),
    triangulos: toFiniteNumber(info.render.triangles),
    geometrias: toFiniteNumber(info.memory.geometries),
    texturas: toFiniteNumber(info.memory.textures),
    programas: toFiniteNumber(info.programs?.length),
    objetosEscena: scene ? scene.children.length : 0,
    gpuTier,
  };

  const { saludable, alertas } = OptimizarRenderizadoUseCase.evaluarMetricasSinAdapter(metricas);

  return { saludable, alertas, metricas };
};

/**
 * Formatea un resultado de evaluación para logging estructurado.
 */
export const formatearMetricasParaLog = (
  metricas: MetricasRenderizado,
): Record<string, number | boolean> => ({
  calls: metricas.drawCalls,
  triangles: metricas.triangulos,
  geometries: metricas.geometrias,
  textures: metricas.texturas,
  programs: metricas.programas,
  sceneObjects: metricas.objetosEscena,
  gpuTier: metricas.gpuTier,
  saludable: metricas.drawCalls <= UMBRALES_RENDERIZADO.drawCallsMaximo,
});
