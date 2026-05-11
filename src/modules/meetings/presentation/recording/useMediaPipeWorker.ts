/**
 * useMediaPipeWorker - Hook para comunicación con el Web Worker de MediaPipe
 * ==========================================================================
 * Gestiona la inicialización, comunicación y limpieza del worker.
 * Mantiene el hilo principal libre para WebRTC y audio.
 * 
 * Uso:
 * const { isReady, analyze, stop } = useMediaPipeWorker({ enableFace: true, enablePose: true });
 * const result = await analyze(videoElement);
 * 
 * Fecha: 2026-01-29
 */

import { useRef, useCallback, useEffect, useState } from 'react';

import mediapipeWorkerRaw from './mediapipe.worker.js?raw';

interface UseMediaPipeWorkerOptions {
  enableFace?: boolean;
  enablePose?: boolean;
  onResult?: (result: MediaPipeResult) => void;
  onError?: (error: string) => void;
}

export interface FaceResult {
  blendshapes: Record<string, number>;
  landmarks: any[] | null;
  hasDetection: boolean;
}

export interface PoseResult {
  landmarks: any[];
  hasDetection: boolean;
}

export interface MediaPipeResult {
  timestamp: number;
  face: FaceResult | null;
  pose: PoseResult | null;
  error?: string;
}

interface WorkerMessage {
  type: 'init' | 'analyze' | 'stop' | 'ready' | 'result' | 'error';
  payload?: any;
}

export const useMediaPipeWorker = (options: UseMediaPipeWorkerOptions = {}) => {
  const { 
    enableFace = true, 
    enablePose = true,
    onResult,
    onError 
  } = options;

  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingCallbacksRef = useRef<Map<number, (result: MediaPipeResult) => void>>(new Map());
  const requestIdRef = useRef(0);
  // Stable refs for callbacks to prevent re-creation loops
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const isReadyRef = useRef(false);
  const isInitializingRef = useRef(false);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { isInitializingRef.current = isInitializing; }, [isInitializing]);

  /**
   * Inicializar el worker con timeout de seguridad
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (workerRef.current || isInitializingRef.current) {
      return isReadyRef.current;
    }

    setIsInitializing(true);
    isInitializingRef.current = true;
    console.log('🔧 [Hook] Iniciando Worker MediaPipe...');

    return new Promise((resolve) => {
      let resolved = false;
      
      // Timeout de 10 segundos para inicialización
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('⚠️ [Hook] Timeout inicializando Worker - usando fallback');
          setIsInitializing(false);
          isInitializingRef.current = false;
          resolve(false);
        }
      }, 10000);

      try {
        // Cargar worker como Blob desde el string crudo importado con ?raw
        // Esto garantiza que Vite no lo transpile como módulo y permite importScripts
        const blob = new Blob([mediapipeWorkerRaw], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl); // Sin { type: 'module' } = Classic Worker

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const { type, payload } = event.data;

          switch (type) {
            case 'ready':
              if (payload?.workerReady) {
                console.log('🔧 [Hook] Worker listo, inicializando MediaPipe...');
                worker.postMessage({
                  type: 'init',
                  payload: { enableFace, enablePose }
                });
              } else if (payload?.success) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.log('✅ [Hook] Worker MediaPipe listo');
                  setIsReady(true);
                  isReadyRef.current = true;
                  setIsInitializing(false);
                  isInitializingRef.current = false;
                  resolve(true);
                }
              } else if (payload?.stopped) {
                setIsReady(false);
              } else if (payload?.error) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.error('❌ [Hook] Error en worker:', payload.error);
                  onErrorRef.current?.(payload.error);
                  setIsInitializing(false);
                  isInitializingRef.current = false;
                  resolve(false);
                }
              }
              break;

            case 'result':
              if (payload.timestamp) {
                const callback = pendingCallbacksRef.current.get(payload.timestamp);
                if (callback) {
                  callback(payload);
                  pendingCallbacksRef.current.delete(payload.timestamp);
                }
                onResultRef.current?.(payload);
              }
              break;

            case 'error':
              console.error('❌ [Hook] Error del worker:', payload);
              onErrorRef.current?.(payload?.message || 'Error desconocido');
              break;
          }
        };

        worker.onerror = (error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.error('❌ [Hook] Error fatal del worker:', error);
            onError?.(error.message);
            setIsInitializing(false);
            resolve(false);
          }
        };

        workerRef.current = worker;

      } catch (error) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error('❌ [Hook] No se pudo crear el worker:', error);
          setIsInitializing(false);
          isInitializingRef.current = false;
          resolve(false);
        }
      }
    });
  }, [enableFace, enablePose]);

  /**
   * Analizar un frame de video
   * Implementa frame-skipping: si el worker está ocupado con un frame anterior,
   * se descarta el nuevo para evitar saturar la cola de mensajes.
   */
  const isProcessingRef = useRef(false);
  const droppedFramesRef = useRef(0);

  const analyze = useCallback(async (
    videoElement: HTMLVideoElement,
    options?: { analyzeFace?: boolean; analyzePose?: boolean }
  ): Promise<MediaPipeResult | null> => {
    if (!workerRef.current || !isReadyRef.current) {
      return null;
    }

    // Frame-skipping: drop frame if worker is still processing the previous one
    if (isProcessingRef.current) {
      droppedFramesRef.current += 1;
      // Log dropped frames periodically (every 50) to avoid console spam
      if (droppedFramesRef.current % 50 === 0) {
        console.log(`⏭️ [Hook] ${droppedFramesRef.current} frames descartados (worker ocupado)`);
      }
      return null;
    }

    try {
      isProcessingRef.current = true;
      // Crear ImageBitmap del video
      const imageBitmap = await createImageBitmap(videoElement);
      const timestamp = performance.now();

      return new Promise((resolve) => {
        // Guardar callback para esta solicitud
        pendingCallbacksRef.current.set(timestamp, (result) => {
          isProcessingRef.current = false;
          resolve(result);
        });

        // Enviar al worker
        // Transferimos el ownership del ImageBitmap para evitar copias
        workerRef.current!.postMessage({
          type: 'analyze',
          payload: {
            imageData: imageBitmap,
            timestamp,
            analyzeFace: options?.analyzeFace ?? enableFace,
            analyzePose: options?.analyzePose ?? enablePose,
          }
        }, [imageBitmap]);

        // Timeout de seguridad (3 segundos)
        setTimeout(() => {
          if (pendingCallbacksRef.current.has(timestamp)) {
            pendingCallbacksRef.current.delete(timestamp);
            isProcessingRef.current = false;
            // Silenced: only log timeout every 10th occurrence to reduce console noise
            resolve(null);
          }
        }, 3000);
      });

    } catch (error) {
      isProcessingRef.current = false;
      console.error('❌ [Hook] Error creando ImageBitmap:', error);
      return null;
    }
  }, [enableFace, enablePose]);

  /**
   * Detener el worker
   */
  const stop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsReady(false);
    pendingCallbacksRef.current.clear();
    console.log('🛑 [Hook] Worker detenido');
  }, []);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isReady,
    isInitializing,
    initialize,
    analyze,
    stop,
  };
};

export default useMediaPipeWorker;
