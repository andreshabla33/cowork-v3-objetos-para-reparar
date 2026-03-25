/**
 * @module infrastructure/MediaPipeSegmenterAdapter
 * Concrete implementation of IBackgroundSegmenter using MediaPipe Tasks Vision.
 * 
 * Optimizations vs the original implementation:
 *  1. GPU delegate (WebGL) instead of CPU — ~10x faster inference
 *  2. Resolution downscaling — processes at 25% resolution for mask generation
 *  3. Singleton model loading — shared across all instances
 *  4. Category mask with direct Uint8Array access — no intermediate canvas
 * 
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js
 */

import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import type { IBackgroundSegmenter, SegmenterConfig, SegmentationMask } from '../domain/ports/IBackgroundSegmenter';

const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm';
const SELFIE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

// ─── Singleton: model loads once, shared across instances ───────────────────
let singletonPromise: Promise<ImageSegmenter> | null = null;
let singletonSegmenter: ImageSegmenter | null = null;
let singletonDelegate: 'CPU' | 'GPU' = 'CPU';

function getOrCreateSegmenter(delegate: 'CPU' | 'GPU'): Promise<ImageSegmenter> {
  // If the delegate changed, we need to re-create
  if (singletonPromise && singletonDelegate !== delegate) {
    singletonSegmenter?.close();
    singletonSegmenter = null;
    singletonPromise = null;
  }

  if (!singletonPromise) {
    singletonDelegate = delegate;
    singletonPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

      // Try GPU first, fall back to CPU if it fails
      try {
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: SELFIE_MODEL_URL,
            delegate: delegate,
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        console.log(`[Segmenter] Initialized with delegate: ${delegate}`);
        singletonSegmenter = segmenter;
        return segmenter;
      } catch (gpuError) {
        if (delegate === 'GPU') {
          console.warn('[Segmenter] GPU delegate failed, falling back to CPU:', gpuError);
          singletonDelegate = 'CPU';
          const segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: SELFIE_MODEL_URL,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
          });
          console.log('[Segmenter] Initialized with delegate: CPU (fallback)');
          singletonSegmenter = segmenter;
          return segmenter;
        }
        throw gpuError;
      }
    })();
  }

  return singletonPromise;
}

// ─── Downscale canvas for inference ─────────────────────────────────────────
let downscaleCanvas: HTMLCanvasElement | null = null;
let downscaleCtx: CanvasRenderingContext2D | null = null;

function getDownscaleCanvas(w: number, h: number): HTMLCanvasElement {
  if (!downscaleCanvas) {
    downscaleCanvas = document.createElement('canvas');
    downscaleCtx = downscaleCanvas.getContext('2d', { willReadFrequently: true })!;
  }
  if (downscaleCanvas.width !== w || downscaleCanvas.height !== h) {
    downscaleCanvas.width = w;
    downscaleCanvas.height = h;
  }
  return downscaleCanvas;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class MediaPipeSegmenterAdapter implements IBackgroundSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private _isReady = false;
  private inferenceScale = 0.25;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(config: SegmenterConfig): Promise<void> {
    this.inferenceScale = Math.max(0.1, Math.min(1.0, config.inferenceScale));
    const delegate = config.preferGPU ? 'GPU' : 'CPU';
    this.segmenter = await getOrCreateSegmenter(delegate);
    this._isReady = true;
  }

  segment(source: HTMLVideoElement | ImageBitmap, timestampMs: number): SegmentationMask | null {
    if (!this.segmenter || !this._isReady) return null;

    let inferenceSource: HTMLVideoElement | HTMLCanvasElement | ImageBitmap = source;
    let inferenceW: number;
    let inferenceH: number;

    // Get source dimensions
    if (source instanceof HTMLVideoElement) {
      inferenceW = source.videoWidth || 640;
      inferenceH = source.videoHeight || 480;
    } else {
      inferenceW = source.width;
      inferenceH = source.height;
    }

    // Downscale if needed (the key optimization: ML inference at 25% resolution)
    if (this.inferenceScale < 1.0) {
      const scaledW = Math.round(inferenceW * this.inferenceScale);
      const scaledH = Math.round(inferenceH * this.inferenceScale);
      const dc = getDownscaleCanvas(scaledW, scaledH);
      downscaleCtx!.drawImage(source, 0, 0, scaledW, scaledH);
      inferenceSource = dc;
      inferenceW = scaledW;
      inferenceH = scaledH;
    }

    try {
      const result = this.segmenter.segmentForVideo(
        inferenceSource as HTMLVideoElement, // MediaPipe accepts CanvasElement too
        timestampMs,
      );

      const categoryMask = result.categoryMask;
      if (!categoryMask) return null;

      // Copy the mask data before MediaPipe recycles it
      const rawData = categoryMask.getAsUint8Array();
      const maskCopy = new Uint8Array(rawData.length);
      maskCopy.set(rawData);

      categoryMask.close();

      return {
        data: maskCopy,
        width: inferenceW,
        height: inferenceH,
      };
    } catch (e) {
      // Individual frame errors are expected during camera switches
      return null;
    }
  }

  dispose(): void {
    // Don't close the singleton — other instances may be using it
    this.segmenter = null;
    this._isReady = false;
  }
}
