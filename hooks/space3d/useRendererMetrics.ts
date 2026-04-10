/**
 * @module hooks/space3d/useRendererMetrics
 *
 * Hook que captura y evalúa métricas del WebGLRenderer en tiempo real.
 * Conecta la capa de presentación con el use case de optimización de renderizado.
 *
 * Arquitectura (Clean Architecture):
 *   - Presentation: este hook (React/R3F binding)
 *   - Infrastructure: `lib/rendering/rendererMetricsMonitor` (lee gl.info)
 *   - Application: `OptimizarRenderizadoUseCase.evaluarMetricasSinAdapter` (umbrales)
 *   - Domain: `MetricasRenderizado`, `UMBRALES_RENDERIZADO`
 *
 * Delta tracking: Compara métricas entre ciclos para detectar oscilaciones
 * de geometrías/texturas que indican leaks o componentes que crean/destruyen
 * recursos innecesariamente (e.g., 634↔714 geometries every ~8s).
 *
 * Idle guard (DEBT-003 part B, 2026-04-10 + hotfix CLEAN-ARCH-F3-2026-04-10):
 *   - Usa `useFrame` en lugar de `setInterval` — se suspende automáticamente
 *     cuando el Canvas opera en `frameloop="demand"` + `AdaptiveFrameloop`.
 *   - Throttle de THROTTLE_LOG_MS por `performance.now()`.
 *   - Emisión condicional: solo loguea si los deltas son ≠ 0.
 *
 * Diseñado para 500+ avatares:
 *   - Cero allocations en hot path (refs reutilizados)
 *   - Idle-guard de doble capa: (a) frameloop suspende useFrame, (b) delta guard
 *     salta emission cuando el renderer info no cambió
 *   - Alertas deduplicadas por sesión
 *
 * Ref CLEAN-ARCH-F5 + CLEAN-ARCH-F3 (hotfix duplicate emitter) + DEBT-003 part B
 * Ref: R3F docs — useFrame runs at native refresh rate, never setState inside
 *   https://r3f.docs.pmnd.rs/api/hooks
 * Ref: R3F docs — frameloop="demand" y on-demand rendering
 *   https://r3f.docs.pmnd.rs/advanced/scaling-performance
 * Ref: R3F pitfalls — reuse objects to reduce GC pressure
 *   https://r3f.docs.pmnd.rs/advanced/pitfalls
 * Ref: Three.js docs — WebGLRenderer.info.memory (geometries, textures)
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { logger } from '@/lib/logger';
import {
  evaluarFrameRenderer,
  formatearMetricasParaLog,
} from '@/lib/rendering/rendererMetricsMonitor';

const log = logger.child('renderer-metrics');

// ─── Configuración ───────────────────────────────────────────────────────────

/**
 * Throttle interval for emission (ms).
 * Always active — idle suppression comes from (a) R3F adaptive frameloop and
 * (b) the delta guard, not from a kill-switch. Ref CLEAN-ARCH-F3 hotfix.
 */
const THROTTLE_LOG_MS = 8_000;

/**
 * Oscillation detection threshold.
 * If geometry count changes by more than this between samples, log a warning.
 * Helps diagnose components that create/destroy geometries every frame cycle.
 */
const DELTA_GEOMETRIAS_UMBRAL = 20;
const DELTA_TEXTURAS_UMBRAL = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Snapshot of memory metrics for delta comparison */
interface MetricsSnapshot {
  geometries: number;
  textures: number;
  drawCalls: number;
  programs: number;
  sceneObjects: number;
  timestamp: number;
}

export interface UseRendererMetricsOptions {
  gpuTier?: number;
  /** DPR actual (para parity con logs previos y diagnóstico de adaptive DPR) */
  adaptiveDpr?: number;
  /** Si true, loguea alertas en consola cuando se superan los umbrales */
  emitirAlertas?: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Monitorea las métricas del renderer, emite alertas cuando se superan umbrales,
 * y detecta oscilaciones de geometrías/texturas que indican resource churn.
 *
 * Debe llamarse dentro del árbol de <Canvas> de R3F (requiere contexto useThree).
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
  const ultimoLogRef = useRef(0);
  const alertasEmitidasRef = useRef(new Set<string>());

  // Delta tracking refs (no allocations in hot path)
  const prevSnapshotRef = useRef<MetricsSnapshot | null>(null);
  const oscilacionCountRef = useRef(0);

  useFrame(() => {
    // Pausa en pestaña oculta (rAF ya no dispara, pero defensivo por si adaptive
    // frameloop se configura en "always")
    if (typeof document !== 'undefined' && document.hidden) return;

    // Warm-up guard (HOTFIX-RENDERER-METRICS-WEBGPU-INFINITY-2026-04-10):
    // WebGPURenderer en Three.js r170 puede reportar `info.render.triangles`
    // como Infinity durante los primeros frames (antes de completar la primera
    // compute pass). Esperamos a que (a) al menos un draw call se haya
    // ejecutado y (b) el contador de triángulos sea finito antes de emitir
    // cualquier sample. Esto evita baselines basura y falsas alertas de dominio.
    if (
      gl.info.render.calls === 0 ||
      !Number.isFinite(gl.info.render.triangles)
    ) {
      return;
    }

    const ahora = performance.now();
    if (ahora - ultimoLogRef.current < THROTTLE_LOG_MS) return;
    ultimoLogRef.current = ahora;

    const resultado = evaluarFrameRenderer(gl, gpuTier);
    const metricas = resultado.metricas;
    const datosLog = formatearMetricasParaLog(metricas);
    const sceneObjectCount = scene.children.length;
    const dprNorm = adaptiveDpr != null ? Number(adaptiveDpr.toFixed(2)) : undefined;

    // ── Delta tracking ──────────────────────────────────────────────
    const currentSnapshot: MetricsSnapshot = {
      geometries: metricas.geometrias,
      textures: metricas.texturas,
      drawCalls: metricas.drawCalls,
      programs: metricas.programas,
      sceneObjects: sceneObjectCount,
      timestamp: ahora,
    };

    const prev = prevSnapshotRef.current;
    if (prev) {
      const deltaGeometries = currentSnapshot.geometries - prev.geometries;
      const deltaTextures = currentSnapshot.textures - prev.textures;
      const deltaDrawCalls = currentSnapshot.drawCalls - prev.drawCalls;
      const deltaPrograms = currentSnapshot.programs - prev.programs;
      const deltaSceneObjects = currentSnapshot.sceneObjects - prev.sceneObjects;
      const elapsedSec = ((currentSnapshot.timestamp - prev.timestamp) / 1000).toFixed(1);

      // DEBT-003 part B — Idle-guard.
      // Cuando la escena está estable las métricas de WebGLRenderer.info
      // se mantienen idénticas entre samples. Saltamos la emisión pero
      // seguimos actualizando prevSnapshotRef para no perder la línea base.
      const hayCambio =
        deltaGeometries !== 0 ||
        deltaTextures !== 0 ||
        deltaDrawCalls !== 0 ||
        deltaPrograms !== 0 ||
        deltaSceneObjects !== 0;

      if (hayCambio) {
        log.info('Frame stats', {
          dpr: dprNorm,
          ...datosLog,
          sceneObjects: sceneObjectCount,
          deltaGeom: deltaGeometries,
          deltaTex: deltaTextures,
          deltaCalls: deltaDrawCalls,
          deltaProg: deltaPrograms,
          deltaScene: deltaSceneObjects,
          intervalSec: elapsedSec,
        });
      }

      // Detect oscillation: significant geometry churn between samples
      if (Math.abs(deltaGeometries) > DELTA_GEOMETRIAS_UMBRAL) {
        oscilacionCountRef.current += 1;

        // Log warning after 3 consecutive oscillations (not a one-off GC event)
        if (oscilacionCountRef.current >= 3) {
          const alertKey = 'geometry-oscillation';
          if (!alertasEmitidasRef.current.has(alertKey)) {
            alertasEmitidasRef.current.add(alertKey);
            log.warn('GEOMETRY OSCILLATION DETECTED — possible resource churn', {
              pattern: `${prev.geometries}→${currentSnapshot.geometries} (Δ${deltaGeometries})`,
              consecutiveOscillations: oscilacionCountRef.current,
              hint: 'Check components creating/destroying geometries on timer or re-render (text labels, name plates, presence indicators)',
            });
          }
        }
      } else {
        // Reset counter when stable
        oscilacionCountRef.current = 0;
      }

      // Texture churn detection
      if (Math.abs(deltaTextures) > DELTA_TEXTURAS_UMBRAL) {
        const alertKey = 'texture-churn';
        if (!alertasEmitidasRef.current.has(alertKey)) {
          alertasEmitidasRef.current.add(alertKey);
          log.warn('Texture churn detected', {
            pattern: `${prev.textures}→${currentSnapshot.textures} (Δ${deltaTextures})`,
            hint: 'Check dynamic texture creation (canvas textures, video textures, sprite updates)',
          });
        }
      }
    } else {
      // First sample — just log baseline
      log.info('Frame stats (baseline)', {
        dpr: dprNorm,
        ...datosLog,
        sceneObjects: sceneObjectCount,
      });
    }

    prevSnapshotRef.current = currentSnapshot;

    // ── Threshold alerts (existing behavior) ────────────────────────
    if (emitirAlertas && !resultado.saludable) {
      for (const alerta of resultado.alertas) {
        if (!alertasEmitidasRef.current.has(alerta)) {
          alertasEmitidasRef.current.add(alerta);
          log.warn('Renderer performance alert', { alerta, ...datosLog });
        }
      }
    }
  });
};
