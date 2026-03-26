/**
 * @module presentation/components/VideoTrackProcessorView
 * Componente React que renderiza un video con efecto de fondo aplicado.
 * Usa el hook useVideoTrackProcessor para procesamiento.
 * 
 * Este componente reemplaza al antiguo VideoWithBackground.
 */

import React, { useEffect, useRef } from 'react';
import { useVideoTrackProcessor, BackgroundEffectType } from '../hooks/useVideoTrackProcessor';

export interface VideoTrackProcessorViewProps {
  /** Track original de la cámara */
  track: MediaStreamTrack | null;
  /** Tipo de efecto: 'none' | 'blur' | 'image' */
  effectType: BackgroundEffectType;
  /** URL de imagen de fondo (solo para effectType='image') */
  backgroundImageUrl?: string | null;
  /** Cantidad de blur (solo para effectType='blur') */
  blurRadius?: number;
  /** Espejar el video horizontalmente */
  mirror?: boolean;
  /** Clase CSS para el contenedor */
  className?: string;
  /** Callback cuando el track procesado está listo */
  onProcessedTrackReady?: (track: MediaStreamTrack | null) => void;
}

/**
 * Componente que muestra video con efecto de fondo (blur o imagen).
 * 
 * Ejemplo de uso:
 * ```tsx
 * <VideoTrackProcessorView
 *   track={cameraTrack}
 *   effectType="blur"
 *   blurRadius={12}
 *   mirror={true}
 *   onProcessedTrackReady={setProcessedTrack}
 * />
 * ```
 */
export const VideoTrackProcessorView: React.FC<VideoTrackProcessorViewProps> = ({
  track,
  effectType,
  backgroundImageUrl,
  blurRadius = 10,
  mirror = false,
  className = '',
  onProcessedTrackReady,
}) => {
  const { processedTrack, isReady, isInitializing } = useVideoTrackProcessor({
    track,
    effectType,
    backgroundImageUrl,
    blurRadius,
    mirror,
  });

  // Notificar al padre cuando el track procesado cambia
  useEffect(() => {
    onProcessedTrackReady?.(processedTrack);
  }, [processedTrack, onProcessedTrackReady]);

  // Si no hay efecto o no hay track, no renderizar nada
  if (!track || effectType === 'none') {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Indicador de carga mientras se inicializa MediaPipe/WebGL */}
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-white/70">Cargando efecto...</span>
          </div>
        </div>
      )}

      {/* Estado listo (procesamiento ocurre internamente en VideoTrackProcessorService) */}
      {isReady && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
          Efecto activo
        </div>
      )}
    </div>
  );
};

VideoTrackProcessorView.displayName = 'VideoTrackProcessorView';

export default VideoTrackProcessorView;
