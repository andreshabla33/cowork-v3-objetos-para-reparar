/**
 * @module domain/ports/IVideoTrackProcessor
 * Puerto principal para procesador de tracks de video con efectos de fondo.
 * Interfaz de alto nivel que expone la capacidad de procesar un MediaStreamTrack
 * y retornar un nuevo track procesado.
 */

import { EffectType } from './IBackgroundCompositor';

export interface VideoTrackProcessorConfig {
  /** Tipo de efecto a aplicar */
  effectType: EffectType;
  /** Cantidad de blur (solo para effectType='blur') */
  blurRadius?: number;
  /** URL de imagen de fondo (solo para effectType='image') */
  backgroundImageUrl?: string | null;
  /** Espejar video horizontalmente */
  mirror?: boolean;
  /** FPS objetivo para procesamiento (default: 15) */
  targetFps?: number;
}

export interface ProcessedVideoTrack {
  /** El track procesado listo para publicar */
  track: MediaStreamTrack;
  /** Stream completo con video procesado + audio original */
  stream: MediaStreamTrack;
  /** Detener el procesamiento y liberar recursos */
  stop(): void;
  /** Actualizar configuración en tiempo real */
  updateConfig(config: Partial<VideoTrackProcessorConfig>): void;
}

/**
 * Puerto para procesador de tracks de video
 * Esta es la interfaz de alto nivel que usa la capa de presentación
 */
export interface IVideoTrackProcessor {
  /** 
   * Procesar un track de video aplicando efecto de fondo
   * @param track Track original de la cámara
   * @param config Configuración del efecto
   * @returns Handle al track procesado con métodos de control
   */
  processTrack(
    track: MediaStreamTrack,
    config: VideoTrackProcessorConfig
  ): Promise<ProcessedVideoTrack>;
  
  /** 
   * Verificar si un track ya está siendo procesado (cache check)
   * @param trackId ID del track
   */
  isProcessing(trackId: string): boolean;
  
  /** 
   * Obtener el track procesado para un track original (si existe en cache)
   * @param originalTrackId ID del track original
   */
  getProcessedTrack(originalTrackId: string): ProcessedVideoTrack | null;
  
  /** 
   * Liberar todos los recursos y detener todo procesamiento
   */
  dispose(): void;
}
