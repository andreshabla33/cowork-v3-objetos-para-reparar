'use client';
/**
 * @module components/3d/AdaptivePerformanceMonitor
 *
 * Clean Architecture — Infrastructure/Presentation.
 * Observador de FPS que ajusta adaptiveDpr dinámicamente dentro de los
 * límites del tier. NO cambia LOD ni shadows (eso sigue siendo static
 * por tier) — solo baja/sube la resolución de renderizado, que es la
 * optimización de menor impacto visual y mayor ganancia de FPS.
 *
 * Activación: solo se monta cuando el user eligió graphicsQuality='auto'
 * (ver isAdaptivePerformanceEnabled en avatarRenderPolicy.ts).
 *
 * Compatibilidad:
 *   - Compatible con frameloop="demand" (R3F docs confirman que
 *     AdaptiveDpr/PerformanceMonitor funcionan independientemente del
 *     modo de renderizado).
 *   - DEBE montarse DENTRO del <Canvas> — PerformanceMonitor es un
 *     componente R3F que requiere el contexto de useThree.
 *
 * Patrón oficial drei (docs 2026):
 *   <PerformanceMonitor
 *     bounds={() => [fpsMin, fpsMax]}
 *     flipflops={3}         // 3 confirmaciones antes de degradar
 *     onDecline={() => bajarDpr()}
 *     onIncline={() => subirDpr()}
 *     onFallback={() => setDprMin()}
 *   />
 *
 * Ref: https://drei.docs.pmnd.rs/performances/performance-monitor
 * Ref: https://r3f.docs.pmnd.rs/advanced/scaling-performance
 */

import React, { useCallback, useRef } from 'react';
import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei';
import { logger } from '@/lib/logger';

const log = logger.child('adaptive-perf');

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AdaptivePerformanceMonitorProps {
  /** DPR actual (controlado desde arriba). */
  currentDpr: number;
  /** Límite inferior del DPR (del tier detectado en boot). */
  minDpr: number;
  /** Límite superior del DPR (del tier detectado en boot). */
  maxDpr: number;
  /** Setter controlado desde el padre. */
  setDpr: (updater: (prev: number) => number) => void;
  /**
   * Umbrales de FPS [min, max]. Si el FPS medio cae por debajo de `min`
   * durante varios ciclos → onDecline. Si sube por encima de `max` → onIncline.
   * Default: [40, 55] — lo bastante agresivo para corregir, lo bastante
   * tolerante para evitar oscilar por stutters puntuales.
   */
  bounds?: [number, number];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Paso de ajuste DPR por evento (proporcional). Conservador para evitar saltos bruscos. */
const DPR_STEP = 0.1;

/** Ciclos de inestabilidad antes de fallback (modo mínimo permanente). */
const FLIPFLOPS = 3;

/** Throttle de logs para no saturar consola con transiciones. */
const LOG_THROTTLE_MS = 5_000;

// ─── Componente ───────────────────────────────────────────────────────────────

export const AdaptivePerformanceMonitor: React.FC<AdaptivePerformanceMonitorProps> = ({
  currentDpr,
  minDpr,
  maxDpr,
  setDpr,
  bounds = [40, 55],
}) => {
  const lastLogMsRef = useRef(0);
  const fallbackFiredRef = useRef(false);

  const logThrottled = useCallback((msg: string, data: Record<string, unknown>) => {
    const now = performance.now();
    if (now - lastLogMsRef.current < LOG_THROTTLE_MS) return;
    lastLogMsRef.current = now;
    log.info(msg, data);
  }, []);

  const handleDecline = useCallback((api: PerformanceMonitorApi) => {
    setDpr((prev) => {
      const next = Math.max(minDpr, +(prev * (1 - DPR_STEP)).toFixed(3));
      if (next === prev) return prev;
      logThrottled('DPR descendido por FPS bajo', {
        prev,
        next,
        avgFps: Math.round(api.averages[api.averages.length - 1] ?? 0),
        factor: api.factor,
      });
      return next;
    });
  }, [logThrottled, minDpr, setDpr]);

  const handleIncline = useCallback((api: PerformanceMonitorApi) => {
    setDpr((prev) => {
      const next = Math.min(maxDpr, +(prev * (1 + DPR_STEP)).toFixed(3));
      if (next === prev) return prev;
      // Al recuperar rendimiento, limpiamos el flag de fallback para poder
      // intentar subir DPR de nuevo en el próximo ciclo de estabilidad.
      fallbackFiredRef.current = false;
      logThrottled('DPR subido por FPS recuperado', {
        prev,
        next,
        avgFps: Math.round(api.averages[api.averages.length - 1] ?? 0),
        factor: api.factor,
      });
      return next;
    });
  }, [logThrottled, maxDpr, setDpr]);

  const handleFallback = useCallback((api: PerformanceMonitorApi) => {
    if (fallbackFiredRef.current) return;
    fallbackFiredRef.current = true;
    // Inestabilidad crónica: hardware no puede mantenerse en ventana aceptable.
    // Fijamos DPR al mínimo para cortar la oscilación. Si el hardware
    // recupera capacidad más tarde (termal throttling liberado, otra
    // pestaña cerrada), onIncline re-habilitará el ciclo.
    setDpr(() => minDpr);
    log.warn('Adaptive DPR fallback → DPR mínimo (hardware inestable)', {
      minDpr,
      lastAvgFps: Math.round(api.averages[api.averages.length - 1] ?? 0),
    });
  }, [minDpr, setDpr]);

  // Bounds fn (wrapped en useCallback para ref estable):
  // drei llama a esta fn con refreshRate del monitor para ajustar targets,
  // pero aquí usamos umbrales absolutos: 40/55 FPS son los objetivos reales
  // para una app colaborativa 3D (por debajo de 40 el movimiento se siente
  // pesado; por encima de 55 hay presupuesto para subir calidad).
  const boundsFn = useCallback(() => bounds, [bounds]);

  return (
    <PerformanceMonitor
      bounds={boundsFn}
      flipflops={FLIPFLOPS}
      onDecline={handleDecline}
      onIncline={handleIncline}
      onFallback={handleFallback}
    />
  );
};

AdaptivePerformanceMonitor.displayName = 'AdaptivePerformanceMonitor';
