/**
 * @module hooks/space3d/useRendererMetrics
 *
 * Hook que captura y evalúa métricas del WebGLRenderer en tiempo real.
 * Conecta la capa de presentación con el use case de optimización de renderizado.
 *
 * Clean Architecture: hook de presentación que usa el infrastructure monitor.
 * NO contiene lógica de negocio — delega a OptimizarRenderizadoUseCase.
 *
 * Ref CLEAN-ARCH-F5
 * Ref: R3F docs — renderer.info para métricas de frame
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { logger } from '@/lib/logger';
import {
  evaluarFrameRenderer,
  formatearMetricasParaLog,
} from '@/lib/rendering/rendererMetricsMonitor';

const log = logger.child('renderer-metrics');

// ─── Intervalo de logging (ms) ────────────────────────────────────────────────
// Loguear cada 5 segundos en dev, no en prod (para no saturar console)
const INTERVALO_LOG_MS = import.meta.env.DEV ? 5_000 : 0;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseRendererMetricsOptions {
  gpuTier?: number;
  /** Si true, loguea alertas en consola cuando se superan los umbrales */
  emitirAlertas?: boolean;
}

/**
 * Monitorea las métricas del renderer y emite alertas cuando se superan umbrales.
 * Llama este hook en el componente VirtualSpace3D o similar (una sola vez).
 *
 * @example
 * // En VirtualSpace3D.tsx:
 * useRendererMetrics({ gpuTier, emitirAlertas: true });
 */
export const useRendererMetrics = ({
  gpuTier = 1,
  emitirAlertas = true,
}: UseRendererMetricsOptions = {}): void => {
  const { gl } = useThree();
  const ultimoLogRef = useRef(0);
  const alertasEmitidasRef = useRef(new Set<string>());

  useEffect(() => {
    if (!gl || INTERVALO_LOG_MS === 0) return;

    const intervalo = setInterval(() => {
      const ahora = performance.now();
      if (ahora - ultimoLogRef.current < INTERVALO_LOG_MS) return;
      ultimoLogRef.current = ahora;

      const resultado = evaluarFrameRenderer(gl, gpuTier);
      const datosLog = formatearMetricasParaLog(resultado.metricas);

      log.info('Frame stats', datosLog);

      if (emitirAlertas && !resultado.saludable) {
        for (const alerta of resultado.alertas) {
          // Evitar spam: solo loguear cada alerta una vez por sesión
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
