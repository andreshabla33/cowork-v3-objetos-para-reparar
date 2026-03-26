/**
 * @module infrastructure/adapters/MediaPipeSegmenterAdapter
 * Adaptador de infraestructura que implementa IBackgroundSegmenter
 * usando el singleton de MediaPipe Segmenter.
 */

import {
  IBackgroundSegmenter,
  SegmenterConfig,
  SegmentationMask,
} from '../../domain/ports/IBackgroundSegmenter';
import { acquireSegmenter, releaseSegmenter } from '../browser/SegmenterSingleton';
import { ImageSegmenter } from '@mediapipe/tasks-vision';

// Downscale canvas para inferencia optimizada
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

export class MediaPipeSegmenterAdapter implements IBackgroundSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private _isReady = false;
  private inferenceScale = 0.25;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(config: SegmenterConfig): Promise<void> {
    this.inferenceScale = Math.max(0.1, Math.min(1.0, config.inferenceScale));
    this.segmenter = await acquireSegmenter(config.preferGPU);
    this._isReady = true;
  }

  segment(
    source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
    timestampMs: number
  ): SegmentationMask | null {
    if (!this.segmenter || !this._isReady) return null;

    let inferenceSource: HTMLVideoElement | HTMLCanvasElement | ImageBitmap = source;
    let inferenceW: number;
    let inferenceH: number;

    // Get source dimensions
    if (source instanceof HTMLVideoElement) {
      inferenceW = source.videoWidth || 640;
      inferenceH = source.videoHeight || 480;
    } else if (source instanceof HTMLCanvasElement) {
      inferenceW = source.width;
      inferenceH = source.height;
    } else {
      inferenceW = source.width;
      inferenceH = source.height;
    }

    // Downscale if needed
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
        inferenceSource as HTMLVideoElement,
        timestampMs
      );

      const categoryMask = result.categoryMask;
      if (!categoryMask) return null;

      // Copy mask data before MediaPipe recycles it
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
      // Individual frame errors during camera switches are expected
      return null;
    }
  }

  dispose(): void {
    // Don't close the singleton - just release our reference
    void releaseSegmenter();
    this.segmenter = null;
    this._isReady = false;
  }
}
