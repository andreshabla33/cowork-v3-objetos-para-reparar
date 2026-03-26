/**
 * @module presentation/hooks/useVideoTrackProcessor
 * Hook de React para la capa de presentación.
 * Expone el VideoTrackProcessorService de aplicación en forma de hook React.
 * 
 * Clean Architecture: Este hook es el adapter entre el dominio/aplicación y React.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  videoTrackProcessor,
  VideoTrackProcessorService,
} from '../../application/VideoTrackProcessorService';
import { VideoTrackProcessorConfig } from '../../domain/ports/IVideoTrackProcessor';

export type BackgroundEffectType = 'none' | 'blur' | 'image';

interface UseVideoTrackProcessorOptions {
  track: MediaStreamTrack | null;
  effectType: BackgroundEffectType;
  backgroundImageUrl?: string | null;
  blurRadius?: number;
  mirror?: boolean;
}

interface UseVideoTrackProcessorReturn {
  /** El track procesado listo para usar en LiveKit/publicación */
  processedTrack: MediaStreamTrack | null;
  /** Si el procesador está listo y funcionando */
  isReady: boolean;
  /** Si está inicializando (cargando modelo MediaPipe, etc.) */
  isInitializing: boolean;
  /** Error si ocurrió alguno */
  error: Error | null;
  /** Actualizar configuración en tiempo real */
  updateConfig: (config: Partial<VideoTrackProcessorConfig>) => void;
}

/**
 * Hook React para procesar tracks de video con efectos de fondo.
 * 
 * Uso típico en componentes de video:
 * ```tsx
 * const { processedTrack, isReady } = useVideoTrackProcessor({
 *   track: cameraTrack,
 *   effectType: 'blur',
 *   blurRadius: 10,
 * });
 * ```
 */
export function useVideoTrackProcessor({
  track,
  effectType,
  backgroundImageUrl,
  blurRadius = 10,
  mirror = false,
}: UseVideoTrackProcessorOptions): UseVideoTrackProcessorReturn {
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const handleRef = useRef<{
    stop: () => void;
    updateConfig: (config: Partial<VideoTrackProcessorConfig>) => void;
  } | null>(null);

  // Efecto principal: iniciar/detener procesamiento cuando cambia el track
  useEffect(() => {
    // Resetear estado
    setError(null);
    
    // Limpiar handle anterior
    if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
      setProcessedTrack(null);
      setIsReady(false);
    }

    // Si no hay track o no hay efecto, no procesar
    if (!track || effectType === 'none') {
      return;
    }

    let mounted = true;

    const init = async () => {
      setIsInitializing(true);
      
      try {
        const handle = await videoTrackProcessor.processTrack(track, {
          effectType,
          backgroundImageUrl: effectType === 'image' ? backgroundImageUrl : null,
          blurRadius,
          mirror,
          targetFps: 15,
        });

        if (!mounted) {
          handle.stop();
          return;
        }

        handleRef.current = handle;
        setProcessedTrack(handle.track);
        setIsReady(true);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
      if (handleRef.current) {
        handleRef.current.stop();
        handleRef.current = null;
      }
    };
  }, [track, effectType]);

  // Actualizar configuración en caliente (sin reinicializar)
  const updateConfig = useCallback((config: Partial<VideoTrackProcessorConfig>) => {
    if (handleRef.current) {
      handleRef.current.updateConfig(config);
    }
  }, []);

  // Efecto para actualizar parámetros sin reinicializar
  useEffect(() => {
    if (handleRef.current && isReady) {
      handleRef.current.updateConfig({
        blurRadius,
        mirror,
        backgroundImageUrl: effectType === 'image' ? backgroundImageUrl : null,
      });
    }
  }, [blurRadius, mirror, backgroundImageUrl, isReady]);

  return {
    processedTrack,
    isReady,
    isInitializing,
    error,
    updateConfig,
  };
}

/**
 * Hook optimizado para obtener un track procesado estable.
 * Usa cache del VideoTrackProcessorService para evitar reprocesamiento.
 */
export function useStableProcessedTrack(
  trackId: string | null,
  config: VideoTrackProcessorConfig
): MediaStreamTrack | null {
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (!trackId) {
      setProcessedTrack(null);
      return;
    }

    // Verificar si ya está en cache
    const cached = videoTrackProcessor.getProcessedTrack(trackId);
    if (cached) {
      setProcessedTrack(cached.track);
      return;
    }

    // No está en cache, no podemos procesar solo con ID
    // Este hook asume que el procesamiento ya inició en otro lugar
    setProcessedTrack(null);
  }, [trackId, config.effectType]);

  return processedTrack;
}
