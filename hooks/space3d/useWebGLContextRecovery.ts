/**
 * @module hooks/space3d/useWebGLContextRecovery
 *
 * Encapsula el ciclo de vida de los listeners `webglcontextlost` /
 * `webglcontextrestored` sobre el canvas del Canvas de React Three Fiber,
 * junto con las métricas de mount / pérdidas de contexto / tiempo-a-ready.
 *
 * Clean Architecture: este hook es **Infrastructure de Presentation** —
 * aísla la interacción con la API de WebGL del DOM para que el componente
 * raíz `VirtualSpace3D` no mezcle detalles de bajo nivel con su lógica
 * de composición.
 *
 * Referencias oficiales:
 *  - https://r3f.docs.pmnd.rs/api/canvas#onCreated
 *  - https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement
 *  - https://react.dev/learn/reusing-logic-with-custom-hooks
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { logger } from '@/lib/logger';

const log = logger.child('useWebGLContextRecovery');

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface WebGLContextRecoveryMetrics {
  mountCount: number;
  contextLossCount: number;
  /** performance.now() cuando se creó el último contexto. */
  mountedAt: number;
  /** performance.now() cuando se disparó la última señal "scene ready". */
  sceneReadyAt: number | null;
}

export interface UseWebGLContextRecoveryReturn {
  /**
   * Handler para `Canvas.onCreated`. Instala los listeners de
   * `webglcontextlost` / `webglcontextrestored`, limpia listeners anteriores
   * y configura el ClearColor.
   */
  handleCanvasCreated: (state: { gl: THREE.WebGLRenderer }) => void;

  /**
   * Handler para marcar la escena como lista. Idempotente y cacheada:
   * subsecuentes llamadas son no-ops hasta que se pierda el contexto.
   */
  markSceneReady: () => void;

  /** true si la escena se ha montado, renderizado y no se ha perdido el contexto. */
  isSceneReady: boolean;

  /** Ref a métricas acumuladas (para telemetría). */
  metricsRef: React.MutableRefObject<WebGLContextRecoveryMetrics>;

  /** Color que se aplica en `setClearColor` al crear el contexto. */
  clearColor: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWebGLContextRecovery(params: {
  clearColor: string;
  /** Callback opcional cuando se pierde el contexto. */
  onContextLost?: () => void;
  /** Callback opcional cuando se recupera el contexto. */
  onContextRestored?: () => void;
  /**
   * Hook opcional para configurar el renderer tras `setClearColor` (p. ej.
   * `toneMappingExposure` dependiente de la config de GPU). Se ejecuta
   * dentro del `onCreated` del Canvas.
   */
  onConfigureRenderer?: (gl: THREE.WebGLRenderer) => void;
}): UseWebGLContextRecoveryReturn {
  const { clearColor, onContextLost, onContextRestored, onConfigureRenderer } = params;

  const canvasDomRef = useRef<HTMLCanvasElement | null>(null);
  const canvasEventHandlersRef = useRef<{
    lost: ((event: Event) => void) | null;
    restored: (() => void) | null;
  }>({ lost: null, restored: null });

  const sceneReadyRef = useRef<boolean>(false);
  const [isSceneReady, setIsSceneReady] = useState(false);

  const metricsRef = useRef<WebGLContextRecoveryMetrics>({
    mountCount: 0,
    contextLossCount: 0,
    mountedAt: 0,
    sceneReadyAt: null,
  });

  // ── Cleanup en unmount del componente raíz ──────────────────────────────────
  useEffect(() => {
    metricsRef.current.mountCount += 1;
    metricsRef.current.mountedAt = now();
    sceneReadyRef.current = false;
    setIsSceneReady(false);
    log.debug('mount', { mountCount: metricsRef.current.mountCount });

    return () => {
      const canvasEl = canvasDomRef.current;
      const handlers = canvasEventHandlersRef.current;
      if (canvasEl && handlers.lost) {
        canvasEl.removeEventListener('webglcontextlost', handlers.lost);
      }
      if (canvasEl && handlers.restored) {
        canvasEl.removeEventListener('webglcontextrestored', handlers.restored);
      }
      canvasDomRef.current = null;
      canvasEventHandlersRef.current = { lost: null, restored: null };
      setIsSceneReady(false);
      log.debug('unmount', { mountCount: metricsRef.current.mountCount });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── handleCanvasCreated: instala listeners + setClearColor ─────────────────
  const handleCanvasCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvasEl = gl.domElement;
    const existing = canvasEventHandlersRef.current;

    // Limpiar listeners anteriores si el mismo canvas se re-crea
    if (canvasDomRef.current && existing.lost) {
      canvasDomRef.current.removeEventListener('webglcontextlost', existing.lost);
    }
    if (canvasDomRef.current && existing.restored) {
      canvasDomRef.current.removeEventListener('webglcontextrestored', existing.restored);
    }

    canvasDomRef.current = canvasEl;
    metricsRef.current.mountedAt = now();
    sceneReadyRef.current = false;
    setIsSceneReady(false);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      metricsRef.current.contextLossCount += 1;
      sceneReadyRef.current = false;
      setIsSceneReady(false);
      log.warn('WebGL context lost', {
        contextLossCount: metricsRef.current.contextLossCount,
      });
      onContextLost?.();
    };

    const handleContextRestored = () => {
      metricsRef.current.mountedAt = now();
      sceneReadyRef.current = false;
      setIsSceneReady(false);
      log.info('WebGL context restored');
      onContextRestored?.();
    };

    canvasEventHandlersRef.current = {
      lost: handleContextLost,
      restored: handleContextRestored,
    };
    canvasEl.addEventListener('webglcontextlost', handleContextLost);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored);

    gl.setClearColor(clearColor);
    onConfigureRenderer?.(gl);
  }, [clearColor, onContextLost, onContextRestored, onConfigureRenderer]);

  // ── markSceneReady: se llama desde onSceneReady de <Scene> ─────────────────
  const markSceneReady = useCallback(() => {
    if (sceneReadyRef.current) return;
    sceneReadyRef.current = true;
    metricsRef.current.sceneReadyAt = now();
    setIsSceneReady(true);
    const elapsedMs = metricsRef.current.mountedAt
      ? Math.round(metricsRef.current.sceneReadyAt! - metricsRef.current.mountedAt)
      : null;
    log.info('scene ready', { elapsedMs });
  }, []);

  return {
    handleCanvasCreated,
    markSceneReady,
    isSceneReady,
    metricsRef,
    clearColor,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
