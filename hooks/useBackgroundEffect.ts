import { useEffect, useRef, useCallback, useState } from 'react';
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

export type BackgroundEffectType = 'none' | 'blur' | 'image';

const MEDIAPIPE_VISION_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm';
const SELFIE_SEGMENTER_MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

interface UseBackgroundEffectOptions {
  effectType: BackgroundEffectType;
  backgroundImage?: string | null;
  blurAmount?: number;
}

interface UseBackgroundEffectReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isProcessing: boolean;
  isSupported: boolean;
  error: string | null;
  processedStream: MediaStream | null;
}

// Singleton para el modelo — se carga una sola vez
let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getOrCreateSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        MEDIAPIPE_VISION_WASM_ROOT
      );
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: SELFIE_SEGMENTER_MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })();
  }
  return segmenterPromise;
}

export const useBackgroundEffect = (
  sourceStream: MediaStream | null,
  options: UseBackgroundEffectOptions
): UseBackgroundEffectReturn => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Cargar imagen de fondo
  useEffect(() => {
    if (options.backgroundImage && options.effectType === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        backgroundImageRef.current = img;
      };
      img.onerror = () => {
        console.error('Error loading background image');
        backgroundImageRef.current = null;
      };
      img.src = options.backgroundImage;
    } else {
      backgroundImageRef.current = null;
    }
  }, [options.backgroundImage, options.effectType]);

  // Convertir categoryMask a un canvas con alfa para composición
  const renderMaskToCanvas = useCallback((
    maskData: Uint8Array,
    width: number,
    height: number,
  ): HTMLCanvasElement => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
    const mc = maskCanvasRef.current;
    mc.width = width;
    mc.height = height;
    const mctx = mc.getContext('2d')!;
    const imageData = mctx.createImageData(width, height);
    const data = imageData.data;
    for (let i = 0; i < maskData.length; i++) {
      const alpha = maskData[i] > 0 ? 255 : 0;
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
    mctx.putImageData(imageData, 0, 0);
    return mc;
  }, []);

  // Composición en main thread
  const composite = useCallback((
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    image: CanvasImageSource,
    mask: CanvasImageSource,
  ) => {
    const { effectType } = options;
    const blurAmount = options.blurAmount || 10;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (effectType === 'blur') {
      ctx.filter = `blur(${blurAmount}px)`;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else if (effectType === 'image' && backgroundImageRef.current) {
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(backgroundImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
  }, [options.effectType, options.blurAmount]);

  // Inicializar segmentación
  useEffect(() => {
    if (!sourceStream || options.effectType === 'none') {
      setIsProcessing(false);
      setProcessedStream(null);
      return;
    }

    let mounted = true;
    let processingActive = false;
    let segmenter: ImageSegmenter | null = null;

    const initSegmentation = async () => {
      try {
        // Crear elemento de video para el stream
        const video = document.createElement('video');
        video.srcObject = sourceStream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        videoRef.current = video;

        // Configurar canvas
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Esperar a que el video tenga dimensiones
        if (!video.videoWidth || !video.videoHeight) {
          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => resolve();
            setTimeout(resolve, 2000);
          });
        }
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Inicializar MediaPipe Tasks Vision (ImageSegmenter)
        segmenter = await getOrCreateSegmenter();

        setIsProcessing(true);

        // Loop de procesamiento
        let lastTimestamp = -1;
        const processFrame = async () => {
          if (!mounted || !videoRef.current || !segmenter || processingActive) {
            if (mounted) animationFrameRef.current = requestAnimationFrame(processFrame);
            return;
          }
          
          processingActive = true;
          try {
            if (videoRef.current.readyState >= 2 && videoRef.current.currentTime !== lastTimestamp) {
              lastTimestamp = videoRef.current.currentTime;
              const nowMs = performance.now();
              const result = segmenter.segmentForVideo(videoRef.current, nowMs);
              const categoryMask = result.categoryMask;

              if (categoryMask) {
                const maskData = categoryMask.getAsUint8Array();
                const maskCanvas = renderMaskToCanvas(maskData, w, h);
                composite(ctx, canvas, videoRef.current, maskCanvas);
                categoryMask.close();
              }
            }
          } catch (e) {
            // Ignorar errores de frames individuales
          }
          processingActive = false;
          
          if (mounted) {
            animationFrameRef.current = requestAnimationFrame(processFrame);
          }
        };

        // Crear stream del canvas
        const canvasStream = canvas.captureStream(30);
        
        // Agregar audio track del stream original si existe
        const audioTracks = sourceStream.getAudioTracks();
        audioTracks.forEach(track => {
          canvasStream.addTrack(track.clone());
        });

        if (mounted) {
          setProcessedStream(canvasStream);
          processFrame();
        }

      } catch (err: any) {
        console.error('[BG-FX] Error initializing background effect:', err);
        if (mounted) {
          setError(err.message || 'Error al inicializar efecto de fondo');
          setIsSupported(false);
          setProcessedStream(null);
        }
      }
    };

    initSegmentation();

    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // No cerramos el segmenter porque es singleton compartido
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
      setIsProcessing(false);
    };
  }, [sourceStream, options.effectType, renderMaskToCanvas, composite]);

  return {
    canvasRef,
    isProcessing,
    isSupported,
    error,
    processedStream,
  };
};

export default useBackgroundEffect;
