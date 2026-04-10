/**
 * @module hooks/space3d/useRendererMetrics
 *
 * Hook que captura y evalúa métricas del WebGLRenderer en tiempo real.
 * Conecta la capa de presentación con el use case de optimización de renderizado.
 *
 * Delta tracking: Compara métricas entre ciclos para detectar oscilaciones
 * de geometrías/texturas que indican leaks o componentes que crean/destruyen
 * recursos innecesariamente (e.g., 634↔714 geometries every ~8s).
 *
 * Diseñado para 500+ avatares:
 *   - No crea objetos en el hot path (reutiliza refs)
 *   - Logging throttled a INTERVALO_LOG_MS
 *   - Alertas deduplicadas por sesión
 *
 * Clean Architecture: hook de presentación que usa el infrastructure monitor.
 * NO contiene lógica de negocio — delega a OptimizarRenderizadoUseCase.
 *
 * Ref CLEAN-ARCH-F5
 * Ref: R3F docs — renderer.info para métricas de frame
 * Ref: Three.js docs — WebGLRenderer.info.memory (geometries, textures)
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { logger } from '@/lib/logger';
import {
  evaluarFrameRenderer,
  formatearMetricasParaLog,
} from '@/lib/rendering/rendererMetricsMonitor';

const log = logger.child('renderer-metrics');

// ─── Configuración ───────────────────────────────────────────────────────────

/** Logging interval in ms. 5s in dev, disabled in prod. */
const INTERVALO_LOG_MS = import.meta.env.DEV ? 5_000 : 0;

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
  timestamp: number;
}

export interface UseRendererMetricsOptions {
  gpuTier?: number;
  /** Si true, loguea alertas en consola cuando se superan los umbrales */
  emitirAlertas?: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Monitorea las métricas del renderer, emite alertas cuando se superan umbrales,
 * y detecta oscilaciones de geometrías/texturas que indican resource churn.
 *
 * Llama este hook en el componente VirtualSpace3D o similar (una sola vez).
 *
 * @example
 * useRendererMetrics({ gpuTier, emitirAlertas: true });
 */
export const useRendererMetrics = ({
  gpuTier = 1,
  emitirAlertas = true,
}: UseRendererMetricsOptions = {}): void => {
  const { gl } = useThree();
  const ultimoLogRef = useRef(0);
  const alertasEmitidasRef = useRef(new Set<string>());

  // Delta tracking refs (no allocations in hot path)
  const prevSnapshotRef = useRef<MetricsSnapshot | null>(null);
  const oscilacionCountRef = useRef(0);

  useEffect(() => {
    if (!gl || INTERVALO_LOG_MS === 0) return;

    const intervalo = setInterval(() => {
      const ahora = performance.now();
      if (ahora - ultimoLogRef.current < INTERVALO_LOG_MS) return;
      ultimoLogRef.current = ahora;

      const resultado = evaluarFrameRenderer(gl, gpuTier);
      const metricas = resultado.metricas;
      const datosLog = formatearMetricasParaLog(metricas);

      // ── Delta tracking ──────────────────────────────────────────────
      const currentSnapshot: MetricsSnapshot = {
        geometries: metricas.geometrias,
        textures: metricas.texturas,
        drawCalls: metricas.drawCalls,
        programs: metricas.programas,
        timestamp: ahora,
      };

      const prev = prevSnapshotRef.current;
      if (prev) {
        const deltaGeometries = currentSnapshot.geometries - prev.geometries;
        const deltaTextures = currentSnapshot.textures - prev.textures;
        const deltaDrawCalls = currentSnapshot.drawCalls - prev.drawCalls;
        const deltaPrograms = currentSnapshot.programs - prev.programs;
        const elapsedSec = ((currentSnapshot.timestamp - prev.timestamp) / 1000).toFixed(1);

        // DEBT-003 (2026-04-10) — Idle-guard.
        // Cuando la escena está estable (cámara/objetos sin cambios) las
        // métricas de WebGLRenderer.info se mantienen idénticas frame a frame.
        // Evitamos spamear la consola emitiendo solo cuando algo cambió.
        // Seguimos actualizando prevSnapshotRef para no perder la línea base.
        const hayCambio =
          deltaGeometries !== 0 ||
          deltaTextures !== 0 ||
          deltaDrawCalls !== 0 ||
          deltaPrograms !== 0;

        if (hayCambio) {
          log.info('Frame stats', {
            ...datosLog,
            deltaGeom: deltaGeometries,
            deltaTex: deltaTextures,
            deltaCalls: deltaDrawCalls,
            deltaProg: deltaPrograms,
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
        log.info('Frame stats (baseline)', datosLog);
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
    }, INTERVALO_LOG_MS);

    return () => clearInterval(intervalo);
  }, [gl, gpuTier, emitirAlertas]);
};
