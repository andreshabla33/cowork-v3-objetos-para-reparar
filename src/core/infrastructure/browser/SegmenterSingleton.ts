/**
 * @module infrastructure/browser/SegmenterSingleton
 * Singleton para el segmentador MediaPipe.
 * El modelo se carga una sola vez y se comparte entre todos los procesadores.
 * Patrón de la industria usado por Google Meet, Zoom, etc.
 */

import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm';
const SELFIE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

interface SegmenterInstance {
  segmenter: ImageSegmenter;
  delegate: 'CPU' | 'GPU';
  refCount: number;
}

let globalSegmenter: SegmenterInstance | null = null;
let segmenterPromise: Promise<SegmenterInstance> | null = null;

/**
 * Adquirir el singleton del segmentador MediaPipe
 * @param preferGPU Intentar usar GPU primero, fallback a CPU
 */
export async function acquireSegmenter(preferGPU: boolean = true): Promise<ImageSegmenter> {
  const delegate = preferGPU ? 'GPU' : 'CPU';
  
  // Si ya existe con el delegate correcto, retornarlo
  if (globalSegmenter) {
    if (globalSegmenter.delegate === delegate) {
      globalSegmenter.refCount++;
      return globalSegmenter.segmenter;
    }
    // Delegate diferente, necesitamos recrear
    await destroySegmenter();
  }

  if (!segmenterPromise) {
    segmenterPromise = createSegmenter(delegate);
  }

  const instance = await segmenterPromise;
  instance.refCount++;
  return instance.segmenter;
}

async function createSegmenter(delegate: 'CPU' | 'GPU'): Promise<SegmenterInstance> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

  try {
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: SELFIE_MODEL_URL,
        delegate,
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });

    console.log(`[SegmenterSingleton] Initialized with delegate: ${delegate}`);
    
    return {
      segmenter,
      delegate,
      refCount: 0,
    };
  } catch (gpuError) {
    if (delegate === 'GPU') {
      console.warn('[SegmenterSingleton] GPU failed, falling back to CPU:', gpuError);
      return createSegmenter('CPU');
    }
    throw gpuError;
  }
}

/**
 * Liberar referencia al segmentador
 * Solo destruye cuando no hay más referencias
 */
export async function releaseSegmenter(): Promise<void> {
  if (globalSegmenter) {
    globalSegmenter.refCount--;
    
    if (globalSegmenter.refCount <= 0) {
      await destroySegmenter();
    }
  }
}

async function destroySegmenter(): Promise<void> {
  if (globalSegmenter) {
    globalSegmenter.segmenter.close();
    globalSegmenter = null;
    segmenterPromise = null;
    console.log('[SegmenterSingleton] Destroyed');
  }
}
