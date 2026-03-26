/**
 * @module domain/ports/IBackgroundSegmenter
 * Port (interface) for background segmentation — Clean Architecture.
 * 
 * The presentation layer (VideoWithBackground) depends on this abstraction,
 * not on concrete MediaPipe classes. This allows swapping implementations
 * (e.g., MediaPipe → TensorFlow.js → native browser API) without changing
 * the UI layer.
 */

export interface SegmentationMask {
  /** Raw mask data — pixel values where 0 = background, non-zero = person */
  data: Uint8Array;
  /** Width of the mask (may differ from source video if downscaled) */
  width: number;
  /** Height of the mask */
  height: number;
}

export interface SegmenterConfig {
  /** Use GPU acceleration when available */
  preferGPU: boolean;
  /**
   * Resolution multiplier for inference (0.0 - 1.0).
   * Lower = faster but coarser mask edges.
   * Default: 0.25 (process at 25% of video resolution → e.g., 320×180 for 1280×720)
   */
  inferenceScale: number;
}

export interface IBackgroundSegmenter {
  /** Initialize the segmenter with the given config */
  initialize(config: SegmenterConfig): Promise<void>;

  /**
   * Segment a video frame, returning a mask that identifies person vs background.
   * @param source - The video element or ImageBitmap to segment
   * @param timestampMs - Monotonic timestamp for the frame (performance.now())
   * @returns SegmentationMask or null if the frame couldn't be processed
   */
  segment(source: HTMLVideoElement | ImageBitmap, timestampMs: number): SegmentationMask | null;

  /** Whether the segmenter has been initialized and is ready */
  readonly isReady: boolean;

  /** Release all resources */
  dispose(): void;
}
