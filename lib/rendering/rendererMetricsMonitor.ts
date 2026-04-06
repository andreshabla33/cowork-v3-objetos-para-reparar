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
 *
 * Ref CLEAN-ARCH-F5: integrado en el hook useRendererMetrics.
 */

import type { WebGLRenderer } from 'three';
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
): ResultadoEvaluacionFrame => {
  const info = renderer.info;

  const metricas: MetricasRenderizado = {
    drawCalls: info.render.calls,
    triangulos: info.render.triangles,
    geometrias: info.memory.geometries,
    texturas: info.memory.textures,
    programas: info.programs?.length ?? 0,
    objetosEscena: 0, // se obtiene desde la escena si es necesario
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
  gpuTier: metricas.gpuTier,
  saludable: metricas.drawCalls <= UMBRALES_RENDERIZADO.drawCallsMaximo,
});
