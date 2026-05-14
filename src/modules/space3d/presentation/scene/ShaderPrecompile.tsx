/**
 * @module modules/space3d/presentation/scene/ShaderPrecompile
 *
 * Pre-compila TODOS los shaders/materiales presentes en la escena ANTES del
 * primer render real. Mueve el coste de compile/link de WebGL programs al
 * tiempo de loading, eliminando el lag inicial de ~5-8 segundos observado
 * en GPU integrada (Intel Iris Xe + ANGLE/D3D11).
 *
 * API oficial: WebGLRenderer.compileAsync(scene, camera): Promise<void>
 * Ref: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.compileAsync
 *
 * Estrategia:
 *  - Se monta como hijo del <Canvas> (acceso a useThree).
 *  - En useEffect mount, programa compileAsync en `requestIdleCallback` para
 *    no bloquear el main thread.
 *  - Re-corre si la escena cambia (mount/unmount mayor de objetos).
 *  - El warm-up de Three.js solo afecta a materiales YA presentes en scene
 *    al momento de la llamada. Materiales agregados después se compilan
 *    lazy en su primer uso (stutter pequeño aceptable).
 *
 * Caveats oficiales:
 *  - compile() es sync y bloquea; compileAsync() es asíncrono y preferido.
 *  - Re-llamadas son baratas: si los shaders ya están compilados, no se
 *    recompilan (Three.js mantiene caché interna por cacheKey).
 *
 * Hardware target: GPU integrada (Iris Xe) donde el compile de ~22 programas
 * cuesta 5-8s sin precompile.
 */

'use client';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('ShaderPrecompile');

/**
 * Componente React invisible que precompila los shaders de la escena.
 * Montar como hijo del <Canvas>, idealmente cerca del fin del árbol R3F
 * para que se ejecute después de que los componentes principales hayan
 * registrado sus materiales.
 */
export function ShaderPrecompile(): null {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    let cancelled = false;
    const compile = async () => {
      const inicio = performance.now();
      try {
        // compileAsync no bloquea el main thread (procesa shaders en chunks).
        await gl.compileAsync(scene, camera);
        if (cancelled) return;
        log.info('shaders precompilados', {
          elapsedMs: Math.round(performance.now() - inicio),
          programs: gl.info?.programs?.length ?? 0,
        });
      } catch (err) {
        if (cancelled) return;
        log.warn('shader precompile falló (no bloqueante)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Idle callback: ejecutar cuando el browser tenga capacidad libre, NO
    // durante la primera render del mount (que ya está cargada).
    // Timeout 1500ms: si el browser está ocupado, forzar igual para no
    // posponer indefinidamente.
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const handle = win.requestIdleCallback
      ? win.requestIdleCallback(() => void compile(), { timeout: 1500 })
      : window.setTimeout(() => void compile(), 0);

    return () => {
      cancelled = true;
      if (win.cancelIdleCallback && typeof handle === 'number') {
        win.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle as number);
      }
    };
  }, [gl, scene, camera]);

  return null;
}
