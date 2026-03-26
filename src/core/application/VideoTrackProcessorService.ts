/**
 * @module application/VideoTrackProcessorService
 * Servicio de aplicación que implementa IVideoTrackProcessor.
 * Usa WeakMap para cachear tracks procesados (patrón de la industria).
 * Maneja el ciclo de vida completo: proceso → actualización → liberación.
 */

import {
  IVideoTrackProcessor,
  VideoTrackProcessorConfig,
  ProcessedVideoTrack,
} from '../domain/ports/IVideoTrackProcessor';
import { IBackgroundSegmenter } from '../domain/ports/IBackgroundSegmenter';
import { IBackgroundCompositor, EffectType } from '../domain/ports/IBackgroundCompositor';
import { MediaPipeSegmenterAdapter } from '../infrastructure/adapters/MediaPipeSegmenterAdapter';
import { WebGLBackgroundCompositorAdapter } from '../infrastructure/adapters/WebGLBackgroundCompositorAdapter';

// Target FPS para procesamiento
const TARGET_FPS = 15;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

interface ProcessingSession {
  originalTrack: MediaStreamTrack;
  processedTrack: MediaStreamTrack;
  outputStream: MediaStream;
  segmenter: IBackgroundSegmenter;
  compositor: IBackgroundCompositor;
  videoElement: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  animationFrameId: number | null;
  lastTimestamp: number;
  lastProcessedAt: number;
  isRunning: boolean;
  config: VideoTrackProcessorConfig;
  backgroundImage: ImageBitmap | null;
}

/**
 * Cache de tracks procesados usando WeakMap.
 * La clave es el track original - cuando el track se libera,
 * la entrada puede ser garbage collected.
 */
const processedTrackCache = new WeakMap<MediaStreamTrack, ProcessingSession>();
const trackIdToOriginalTrack = new Map<string, MediaStreamTrack>();

/**
 * Servicio de aplicación para procesar tracks de video con efectos de fondo.
 * Implementa el patrón singleton de la industria para video conferencing.
 */
export class VideoTrackProcessorService implements IVideoTrackProcessor {
  private static instance: VideoTrackProcessorService | null = null;
  
  private constructor() {}
  
  static getInstance(): VideoTrackProcessorService {
    if (!VideoTrackProcessorService.instance) {
      VideoTrackProcessorService.instance = new VideoTrackProcessorService();
    }
    return VideoTrackProcessorService.instance;
  }

  /**
   * Procesar un track de video aplicando efecto de fondo
   */
  async processTrack(
    track: MediaStreamTrack,
    config: VideoTrackProcessorConfig
  ): Promise<ProcessedVideoTrack> {
    // Verificar si ya está en cache
    const cached = processedTrackCache.get(track);
    if (cached) {
      // Actualizar configuración si cambió
      this.updateSessionConfig(cached, config);
      return this.createProcessedVideoTrackHandle(cached);
    }

    // Crear nueva sesión de procesamiento
    const session = await this.createProcessingSession(track, config);
    processedTrackCache.set(track, session);
    trackIdToOriginalTrack.set(track.id, track);

    return this.createProcessedVideoTrackHandle(session);
  }

  /**
   * Verificar si un track está siendo procesado
   */
  isProcessing(trackId: string): boolean {
    const originalTrack = trackIdToOriginalTrack.get(trackId);
    if (!originalTrack) return false;
    return processedTrackCache.has(originalTrack);
  }

  /**
   * Obtener track procesado de cache
   */
  getProcessedTrack(originalTrackId: string): ProcessedVideoTrack | null {
    const originalTrack = trackIdToOriginalTrack.get(originalTrackId);
    if (!originalTrack) return null;
    
    const session = processedTrackCache.get(originalTrack);
    if (!session) return null;
    
    return this.createProcessedVideoTrackHandle(session);
  }

  /**
   * Liberar todos los recursos
   */
  dispose(): void {
    // WeakMap no tiene clear/forEach, usamos el Map auxiliar
    trackIdToOriginalTrack.forEach((originalTrack) => {
      const session = processedTrackCache.get(originalTrack);
      if (session) {
        this.stopSession(session);
      }
    });
    
    trackIdToOriginalTrack.clear();
  }

  // ─── Private methods ──────────────────────────────────────────────────────

  private async createProcessingSession(
    track: MediaStreamTrack,
    config: VideoTrackProcessorConfig
  ): Promise<ProcessingSession> {
    // Crear video element para el track
    const videoElement = document.createElement('video');
    videoElement.srcObject = new MediaStream([track]);
    videoElement.playsInline = true;
    videoElement.muted = true;
    await videoElement.play();

    // Esperar a que tenga dimensiones
    await this.waitForVideoDimensions(videoElement);

    const width = videoElement.videoWidth || 640;
    const height = videoElement.videoHeight || 480;

    // Inicializar segmentador (singleton)
    const segmenter = new MediaPipeSegmenterAdapter();
    await segmenter.initialize({
      preferGPU: true,
      inferenceScale: 0.25,
    });

    // Inicializar compositor (singleton WebGL context)
    const compositor = new WebGLBackgroundCompositorAdapter();
    await compositor.initialize({
      width,
      height,
      effectType: config.effectType === 'none' ? 'blur' : config.effectType as Exclude<EffectType, 'none'>,
      blurRadius: config.blurRadius ?? 10,
      mirror: config.mirror ?? false,
    });

    // Cargar imagen de fondo si es necesario
    let backgroundImage: ImageBitmap | null = null;
    if (config.effectType === 'image' && config.backgroundImageUrl) {
      backgroundImage = await this.loadBackgroundImage(config.backgroundImageUrl);
      if (backgroundImage) {
        compositor.setBackgroundImage(backgroundImage);
      }
    }

    // Crear canvas y stream de salida
    const canvas = compositor.getCanvas();
    const outputStream = canvas.captureStream(TARGET_FPS);
    
    // Agregar audio track si existe
    // Nota: El track original es video, el audio viene por separado
    
    const processedTrack = outputStream.getVideoTracks()[0];

    const session: ProcessingSession = {
      originalTrack: track,
      processedTrack,
      outputStream,
      segmenter,
      compositor,
      videoElement,
      canvas,
      animationFrameId: null,
      lastTimestamp: -1,
      lastProcessedAt: 0,
      isRunning: false,
      config: { ...config },
      backgroundImage,
    };

    // Iniciar loop de procesamiento
    this.startProcessingLoop(session);

    return session;
  }

  private startProcessingLoop(session: ProcessingSession): void {
    if (session.isRunning) return;
    
    session.isRunning = true;

    const processFrame = async () => {
      if (!session.isRunning) return;

      const now = performance.now();
      
      // Throttling a 15 FPS
      if (now - session.lastProcessedAt < FRAME_INTERVAL_MS) {
        session.animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      try {
        if (
          session.videoElement.readyState >= 2 &&
          session.videoElement.currentTime !== session.lastTimestamp
        ) {
          session.lastTimestamp = session.videoElement.currentTime;
          session.lastProcessedAt = now;

          // 1. Segmentar
          const mask = session.segmenter.segment(session.videoElement, now);
          
          if (mask) {
            // 2. Componer
            session.compositor.composite(
              session.videoElement,
              mask.data,
              mask.width,
              mask.height
            );
          }
        }
      } catch (e) {
        // Errores individuales de frame son esperados
      }

      session.animationFrameId = requestAnimationFrame(processFrame);
    };

    session.animationFrameId = requestAnimationFrame(processFrame);
  }

  private stopSession(session: ProcessingSession): void {
    session.isRunning = false;
    
    if (session.animationFrameId) {
      cancelAnimationFrame(session.animationFrameId);
      session.animationFrameId = null;
    }

    session.videoElement.pause();
    session.videoElement.srcObject = null;
    
    session.segmenter.dispose();
    session.compositor.dispose();
    
    session.outputStream.getTracks().forEach(t => t.stop());
  }

  private updateSessionConfig(
    session: ProcessingSession,
    config: Partial<VideoTrackProcessorConfig>
  ): void {
    // Actualizar configuración en caliente
    if (config.effectType !== undefined && config.effectType !== session.config.effectType) {
      session.config.effectType = config.effectType;
      session.compositor.updateConfig({
        effectType: config.effectType === 'none' ? 'blur' : config.effectType as Exclude<EffectType, 'none'>,
      });
    }
    
    if (config.blurRadius !== undefined) {
      session.config.blurRadius = config.blurRadius;
      session.compositor.updateConfig({ blurRadius: config.blurRadius });
    }
    
    if (config.mirror !== undefined) {
      session.config.mirror = config.mirror;
      session.compositor.updateConfig({ mirror: config.mirror });
    }
    
    if (config.backgroundImageUrl !== undefined && 
        config.backgroundImageUrl !== session.config.backgroundImageUrl) {
      session.config.backgroundImageUrl = config.backgroundImageUrl;
      if (config.effectType === 'image' && config.backgroundImageUrl) {
        this.loadBackgroundImage(config.backgroundImageUrl).then(bitmap => {
          if (bitmap) {
            session.backgroundImage = bitmap;
            session.compositor.setBackgroundImage(bitmap);
          }
        });
      }
    }
  }

  private createProcessedVideoTrackHandle(session: ProcessingSession): ProcessedVideoTrack {
    return {
      track: session.processedTrack,
      stream: session.processedTrack,
      stop: () => {
        this.stopSession(session);
        processedTrackCache.delete(session.originalTrack);
        trackIdToOriginalTrack.delete(session.originalTrack.id);
      },
      updateConfig: (config) => {
        this.updateSessionConfig(session, config);
      },
    };
  }

  private waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      if (video.videoWidth > 0) {
        resolve();
      } else {
        video.onloadedmetadata = () => resolve();
      }
    });
  }

  private loadBackgroundImage(url: string): Promise<ImageBitmap | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const bitmap = await createImageBitmap(img);
          resolve(bitmap);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
}

// Exportar singleton
export const videoTrackProcessor = VideoTrackProcessorService.getInstance();
