/**
 * @module space3d/hooks/useSceneReadySignal
 *
 * Dispara `onSceneReady()` UNA VEZ tras montar la geometría merged
 * (StaticObjectBatcher + BuiltinWallBatcher). Gated por la flag
 * `sceneOptimizationReady` + un `requestAnimationFrame` post-render para
 * asegurar que el `WebGPURenderer` haya submitted los draw calls a GPU.
 *
 * Sin esto, la pantalla de loading se ocultaba antes que los batchers
 * completaran su `useMemo` síncrono → pop-in visible donde paredes de
 * cristal aparecían sólidas durante ~2 segundos.
 *
 * Extraído de `Scene3D.tsx` (ITEM 15 P1-07).
 *
 * Refs:
 *  - https://react.dev/reference/react/useEffect (useEffect fires post-commit)
 *  - MDN requestAnimationFrame: garantiza un frame entre useEffect y siguiente render
 */

import { useEffect, useRef } from 'react';

export interface UseSceneReadySignalParams {
  /** Si `true`, los servicios de optimización DI están listos (modo normal). */
  sceneOptimizationReady: boolean;
  /** Admin en modo edición: batchers no participan, signal inmediato post-rAF. */
  isEditMode: boolean;
  /** Callback que oculta la pantalla de loading. */
  onSceneReady?: () => void;
  /**
   * Logger opcional (inyectado por el componente padre). Se invoca al firing
   * exitoso con metadata para observabilidad.
   */
  onFired?: (meta: { mode: 'edit' | 'normal'; optimizationReady: boolean }) => void;
}

/**
 * Hook idempotente: dispara `onSceneReady()` exactamente una vez tras un
 * `rAF` cuando se cumple la condición (`isEditMode` || `sceneOptimizationReady`).
 *
 * Si la dependencia cambia y aún no se cumplió la condición, el efecto se
 * re-evalúa sin firing previo. Una vez firing, queda sellado por
 * `firedRef` y no se vuelve a disparar.
 */
export function useSceneReadySignal(params: UseSceneReadySignalParams): void {
  const { sceneOptimizationReady, isEditMode, onSceneReady, onFired } = params;
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !onSceneReady) return;

    // En edit mode: no batchers needed, individual meshes render synchronously.
    // En normal mode: wait until sceneOptimization services are ready,
    // which gates the batcher render (conditional al final del componente).
    const shouldFire = isEditMode || sceneOptimizationReady;
    if (!shouldFire) return;

    // Wait one animation frame so Three.js processes the newly mounted
    // geometry. useEffect fires after React commit → scene graph updated →
    // rAF ensures the WebGPURenderer has submitted the draw calls.
    const rafId = requestAnimationFrame(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onSceneReady();
      onFired?.({
        mode: isEditMode ? 'edit' : 'normal',
        optimizationReady: sceneOptimizationReady,
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [sceneOptimizationReady, isEditMode, onSceneReady, onFired]);
}
