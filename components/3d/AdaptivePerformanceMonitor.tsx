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
    const lastAvgFps = Math.round(api.averages[api.averages.length - 1] ?? 0);
    // drei dispara onFallback cuando acumula `flipflops` cruces sin poder
    // estabilizar. Pero eso NO siempre significa HW sufriendo:
    //   - Si FPS >= bounds[0], el HW está saludable y los "flips" son
    //     solo onIncline fallidos porque el DPR ya está en maxDpr.
    //     Tratarlo como fallback → bajar DPR a minDpr sería regresión.
    // Solo degradamos si el FPS está realmente por debajo del objetivo.
    // Ref: https://drei.docs.pmnd.rs/performances/performance-monitor
    if (lastAvgFps >= bounds[0]) {
      log.info('Adaptive DPR fallback ignorado — FPS saludable', {
        lastAvgFps,
        targetMin: bounds[0],
      });
      return;
    }
    if (fallbackFiredRef.current) return;
    fallbackFiredRef.current = true;
    setDpr(() => minDpr);
    log.warn('Adaptive DPR fallback → DPR mínimo (hardware inestable)', {
      minDpr,
      lastAvgFps,
    });
  }, [bounds, minDpr, setDpr]);

  // Bounds dinámicos usando refresh rate real del monitor (drei lo pasa).
  // Antes: [40, 55] fijo → en monitores 60/120/144 Hz, FPS normales (>60)
  // disparaban onIncline continuamente, y al estar el DPR ya en maxDpr
  // (clampado por tier), drei contaba esos intentos fallidos como
  // "flipflops" y terminaba en onFallback. Ahora el bound superior se
  // ajusta al refresh rate real → 60 FPS en 60 Hz = estable, no flip.
  const boundsFn = useCallback((refreshrate: number) => {
    const min = bounds[0];
    const rate = Number.isFinite(refreshrate) && refreshrate > 0 ? refreshrate : 60;
    const max = Math.max(bounds[1], Math.floor(rate));
    return [min, max] as [number, number];
  }, [bounds]);

  // Si maxDpr === minDpr, no hay rango para ajustar — montar el monitor
  // solo generaría fallbacks espurios. Observado en Windows 100% scale
  // con GPU integrada: window.devicePixelRatio=1 + cap tier=1.25 →
  // maxDpr=1=minDpr. Sin margen de ajuste, early return.
  if (maxDpr <= minDpr) return null;

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
