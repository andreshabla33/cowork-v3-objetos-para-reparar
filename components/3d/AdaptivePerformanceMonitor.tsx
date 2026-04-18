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

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
const FLIPFLOPS = 5;

/** Throttle de logs para no saturar consola con transiciones. */
const LOG_THROTTLE_MS = 5_000;

/**
 * Warm-up guard: ventana inicial en la que NO se monta el PerformanceMonitor.
 *
 * Motivación (observado en logs 2026-04-18 00:17:58.960):
 *   Durante el boot (0-10s) el FPS cae a ~30 por CPU bound, NO por GPU:
 *     - LiveKit handshake + fetchRegionSettings (~4s)
 *     - TURN credentials refresh
 *     - AudioContext resume
 *     - Suscripción a canales Realtime
 *     - React reconciliation inicial + batching de 764 instances
 *   El monitor interpretaba estos ~30 FPS como "hardware inestable" y
 *   disparaba fallback a minDpr de forma permanente — completamente
 *   innecesario porque la escena tras el boot corría 60 FPS sanos.
 *
 * 10s cubre el P99 del boot observado (ver AUDITORIA_100_USERS). Después
 * de eso, PerformanceMonitor interpreta solo carga real de GPU.
 */
const WARMUP_DELAY_MS = 10_000;

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

  // Warm-up: no montar el monitor hasta superar el boot phase (CPU-bound).
  const [warmUpDone, setWarmUpDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setWarmUpDone(true);
      log.info('AdaptivePerf monitor activo tras warm-up', {
        warmUpMs: WARMUP_DELAY_MS,
        currentDpr,
      });
    }, WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  // Intencionalmente sin deps de currentDpr: solo arrancamos el timer al mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (!warmUpDone) return null;

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
