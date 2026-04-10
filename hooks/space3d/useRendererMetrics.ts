/**
 * @module hooks/space3d/useRendererMetrics
 *
 * Hook que captura y evalúa métricas del WebGLRenderer/WebGPURenderer en tiempo
 * real mediante una ventana deslizante (sliding-window) de estabilidad.
 *
 * Conecta la capa de presentación con el caso de uso
 * `OptimizarRenderizadoUseCase.evaluarEstabilidadRenderizado` siguiendo Clean
 * Architecture: el hook no contiene lógica de decisión, solo orquestación
 * React/R3F + serialización para logging.
 *
 * Arquitectura (Clean Architecture):
 *   - Presentation : este hook (React/R3F binding)
 *   - Infrastructure : `lib/rendering/rendererMetricsMonitor` (lee gl.info,
 *                      sanea valores no-finitos, acopla scene.children.length)
 *   - Application : `OptimizarRenderizadoUseCase.evaluarEstabilidadRenderizado`
 *   - Domain : `EstabilidadRenderizado` (VO `VentanaEstabilidad`, reglas puras)
 *              + `MetricasRenderizado`, `UMBRALES_RENDERIZADO`
 *
 * Idle-guard (DEBT-003 part B CLOSE 2026-04-10):
 *
 *   Sustituye el esquema legacy de "delta frame-a-frame === 0" (CLEAN-ARCH-F3)
 *   por un evaluador de estabilidad sobre ventana deslizante. Esto alinea el
 *   hook con las best practices oficiales:
 *
 *     - Three.js Tip 42: detectar crecimiento monótono, no variación puntual.
 *       https://www.utsubo.com/blog/threejs-best-practices-100-tips
 *     - R3F PerformanceMonitor pattern — análisis sobre ventana temporal.
 *       https://r3f.docs.pmnd.rs/advanced/scaling-performance
 *     - three.js issue #5680 — renderer.info.memory.geometries es aproximado,
 *       fluctúa por internals legítimos (InstancedMesh resize, DataTexture
 *       flush, BatchedMesh reorder, shadow traversal).
 *       https://github.com/mrdoob/three.js/issues/5680
 *
 *   Resultado: la emisión de logs solo ocurre cuando hay una señal realmente
 *   accionable (baseline, inestabilidad en drawCalls/programas/objetosEscena,
 *   o crecimiento monótono de geometrias/texturas = leak real).
 *
 * Zero allocations en hot path (ring buffer inmutable manejado por refs).
 *
 * Ref DEBT-003-B-CLOSE-2026-04-10.
 * Ref: R3F docs — useFrame runs at native refresh rate, never setState inside
 *   https://r3f.docs.pmnd.rs/api/hooks
 * Ref: R3F docs — frameloop="demand" y on-demand rendering
 *   https://r3f.docs.pmnd.rs/advanced/scaling-performance
 * Ref: Three.js docs — WebGLRenderer.info.memory (geometries, textures)
 *   https://threejs.org/docs/#api/en/renderers/WebGLRenderer
 * Ref HOTFIX-RENDERER-METRICS-WEBGPU-INFINITY-2026-04-10 (warm-up guard)
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { logger } from '@/lib/logger';
import {
  evaluarFrameRenderer,
  formatearMetricasParaLog,
} from '@/lib/rendering/rendererMetricsMonitor';
import { OptimizarRenderizadoUseCase } from '@/core/application/usecases/OptimizarRenderizadoUseCase';
import type {
  MuestraRenderizado,
  VentanaEstabilidad,
} from '@/core/domain/ports/EstabilidadRenderizado';

const log = logger.child('renderer-metrics');

// ─── Configuración ───────────────────────────────────────────────────────────

/**
 * Throttle de muestreo (ms). Intervalo entre samples que alimentan la ventana
 * deslizante. La latencia de veredicto de estabilidad es N × THROTTLE donde N
 * es `VENTANA_ESTABILIDAD_MAX_SAMPLES` (default 3 → 24s).
 */
const THROTTLE_LOG_MS = 8_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseRendererMetricsOptions {
  gpuTier?: number;
  /** DPR actual (para parity con logs previos y diagnóstico de adaptive DPR) */
  adaptiveDpr?: number;
  /** Si true, loguea alertas cuando se superan los umbrales del dominio */
  emitirAlertas?: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Monitorea las métricas del renderer emitiendo logs solo cuando la ventana
 * deslizante detecta una señal accionable. Debe llamarse dentro del árbol de
 * <Canvas> de R3F (requiere contexto useThree).
 *
 * @example
 * const RendererMetricsProbe = () => {
 *   useRendererMetrics({ gpuTier, adaptiveDpr });
 *   return null;
 * };
 */
export const useRendererMetrics = ({
  gpuTier = 1,
  adaptiveDpr,
  emitirAlertas = true,
}: UseRendererMetricsOptions = {}): void => {
  const { gl, scene } = useThree();
  const ultimoSampleRef = useRef(0);
  const alertasEmitidasRef = useRef(new Set<string>());

  // Ring buffer inmutable de la ventana deslizante (cero allocations en frames
  // que no cruzan el throttle; una allocation por sample cruzado).
  const ventanaRef = useRef<VentanaEstabilidad>(
    OptimizarRenderizadoUseCase.crearVentanaEstabilidadVacia(),
  );

  useFrame(() => {
    // Pausa en pestaña oculta (rAF ya no dispara, pero defensivo por si
    // adaptive frameloop se configura en "always")
    if (typeof document !== 'undefined' && document.hidden) return;

    // Warm-up guard (HOTFIX-RENDERER-METRICS-WEBGPU-INFINITY-2026-04-10):
    // WebGPURenderer en Three.js r170 puede reportar `info.render.triangles`
    // como Infinity durante los primeros frames (antes de completar la primera
    // compute pass). Esperamos a que (a) al menos un draw call se haya
    // ejecutado y (b) el contador de triángulos sea finito antes de emitir
    // cualquier sample. Esto evita baselines basura y falsas alertas.
    if (
      gl.info.render.calls === 0 ||
      !Number.isFinite(gl.info.render.triangles)
    ) {
      return;
    }

    const ahora = performance.now();
    if (ahora - ultimoSampleRef.current < THROTTLE_LOG_MS) return;
    ultimoSampleRef.current = ahora;

    // ── Infrastructure → Domain boundary ────────────────────────────
    const resultadoFrame = evaluarFrameRenderer(gl, gpuTier, scene);
    const metricas = resultadoFrame.metricas;

    // ── Application: sliding-window stability decision ──────────────
    const muestra: MuestraRenderizado = {
      metricas,
      timestampMs: ahora,
    };
    const { ventanaActualizada, resultado } =
      OptimizarRenderizadoUseCase.evaluarEstabilidadRenderizado(
        ventanaRef.current,
        muestra,
      );
    ventanaRef.current = ventanaActualizada;

    // ── Presentation: emit only when required ───────────────────────
    if (resultado.debeEmitir) {
      const datosLog = formatearMetricasParaLog(metricas);
      const dprNorm =
        adaptiveDpr != null ? Number(adaptiveDpr.toFixed(2)) : undefined;

      switch (resultado.motivo) {
        case 'baseline': {
          log.info('Frame stats (baseline)', { dpr: dprNorm, ...datosLog });
          break;
        }
        case 'leak-geometrias': {
          const alertKey = 'leak-geometrias';
          if (!alertasEmitidasRef.current.has(alertKey)) {
            alertasEmitidasRef.current.add(alertKey);
            log.warn('GEOMETRY LEAK SUSPECTED — monotonic growth detected', {
              dpr: dprNorm,
              ...datosLog,
              hint: 'Check components that create geometries without disposing: text labels, name plates, presence indicators, clone chains',
              windowSec:
                ((THROTTLE_LOG_MS * ventanaActualizada.maxSize) / 1000).toFixed(
                  0,
                ),
            });
          }
          break;
        }
        case 'leak-texturas': {
          const alertKey = 'leak-texturas';
          if (!alertasEmitidasRef.current.has(alertKey)) {
            alertasEmitidasRef.current.add(alertKey);
            log.warn('TEXTURE LEAK SUSPECTED — monotonic growth detected', {
              dpr: dprNorm,
              ...datosLog,
              hint: 'Check dynamic texture creation (canvas textures, video textures, sprite updates, un-disposed render targets)',
              windowSec:
                ((THROTTLE_LOG_MS * ventanaActualizada.maxSize) / 1000).toFixed(
                  0,
                ),
            });
          }
          break;
        }
        case 'inestable': {
          log.info('Frame stats', { dpr: dprNorm, ...datosLog });
          break;
        }
        case 'idle-suprimido': {
          // Nunca debería ocurrir: el use-case devuelve debeEmitir:false
          // para este motivo. Mantenido por exhaustiveness check.
          break;
        }
      }
    }

    // ── Threshold alerts (domain-driven, deduplicadas por sesión) ───
    if (emitirAlertas && !resultadoFrame.saludable) {
      const datosLog = formatearMetricasParaLog(metricas);
      for (const alerta of resultadoFrame.alertas) {
        if (!alertasEmitidasRef.current.has(alerta)) {
          alertasEmitidasRef.current.add(alerta);
          log.warn('Renderer performance alert', { alerta, ...datosLog });
        }
      }
    }
  });
};
