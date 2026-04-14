'use client';

/**
 * @module components/space3d/Precompile
 *
 * Fuerza la compilación de shaders/materiales de la escena 3D ANTES del
 * primer paint del navegador. Elimina el "lag spike" visual de compilación
 * síncrona de shaders que ocurre en el primer frame tras montar un GLTF.
 *
 * ════════════════════════════════════════════════════════════════
 * Patrón oficial (Paul Henschel, maintainer R3F)
 * ════════════════════════════════════════════════════════════════
 *
 * Ref: https://github.com/pmndrs/react-three-fiber/discussions/821
 *
 * ```tsx
 * function Precompile() {
 *   const { gl, scene, camera } = useThree();
 *   useLayoutEffect(() => void gl.compile(scene, camera), []);
 *   return null;
 * }
 * ```
 *
 * `useLayoutEffect` garantiza que `gl.compile()` se ejecute antes del
 * paint del navegador — los shaders quedan listos cuando el browser pinta
 * el primer frame.
 *
 * `useGLTF.preload()` y `<Suspense>` solo garantizan descarga y parseo del
 * archivo; NO compilan shaders (doc oficial R3F `Loading Models`). El
 * patrón `<Precompile />` cierra ese hueco.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (R3F layer)
 * ════════════════════════════════════════════════════════════════
 *
 * Componente sin lógica de negocio. Vive dentro del `<Canvas>` del espacio
 * 3D, después del `<Scene>` que contiene el subárbol a compilar. Emite un
 * callback `onPrecompiled` una vez `gl.compile()` ha terminado — el root
 * lo usa para gate el `onSceneReady` real.
 */

import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { logger } from '@/lib/logger';

const log = logger.child('Precompile');

export interface PrecompileProps {
  /**
   * Callback invocado una sola vez cuando la compilación síncrona de
   * shaders de `scene` con `camera` ha terminado. El consumidor puede
   * usar esto para liberar el loader.
   */
  onPrecompiled?: () => void;
}

export const Precompile: React.FC<PrecompileProps> = ({ onPrecompiled }) => {
  const { gl, scene, camera } = useThree();

  useLayoutEffect(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      // gl.compile() recorre la escena desde `camera` y compila todos los
      // materiales/shaders que el renderer va a necesitar. Síncrono; si la
      // escena es grande (terreno + walls + muebles merged) puede tardar
      // decenas de ms, pero ese tiempo se paga ANTES del primer paint y
      // evita el stall visible del primer frame.
      gl.compile(scene, camera);
    } catch (err) {
      log.warn('gl.compile threw — continuing without precompile', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    );
    log.info('shaders compilados', { elapsedMs });
    onPrecompiled?.();
    // Deps vacías: solo queremos precompilar una vez por mount del Canvas.
    // Si el contexto WebGL se pierde y se recupera, `<Canvas>` remount el
    // árbol entero y este efecto volverá a correr.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
