/**
 * @module domain/ports/IBackgroundCompositor
 * Port (interface) for background composition — Clean Architecture.
 * 
 * Responsible for compositing the final frame:
 *   person pixels (sharp) + background pixels (blurred or replaced image).
 * 
 * Implementations can use Canvas2D (fallback) or WebGL (fast path).
 */

export type CompositorEffectType = 'blur' | 'image';

export interface CompositorConfig {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Type of background effect */
  effectType: CompositorEffectType;
  /** Blur radius in pixels (only for effectType='blur') */
  blurRadius: number;
  /** Whether to mirror the video horizontally */
  mirror: boolean;
}

export interface IBackgroundCompositor {
  /** Initialize the compositor with a target canvas */
  initialize(config: CompositorConfig): Promise<void>;

  /**
   * Composite one frame using the provided image and mask.
   * @param image - Original video frame
   * @param mask  - Segmentation mask (person = white, bg = black)
   * @param maskWidth - Width of the mask (may differ from image if downscaled)
   * @param maskHeight - Height of the mask
   */
  composite(
    image: HTMLVideoElement | ImageBitmap,
    mask: Uint8Array,
    maskWidth: number,
    maskHeight: number,
  ): void;

  /** Set a background image for 'image' effect type */
  setBackgroundImage(bitmap: ImageBitmap): void;

  /** Update effect configuration without reinitializing */
  updateConfig(partial: Partial<CompositorConfig>): void;

  /** Get the output canvas for stream capture */
  getCanvas(): HTMLCanvasElement | OffscreenCanvas;

  /** Whether the compositor is ready */
  readonly isReady: boolean;

  /** Release all GPU/canvas resources */
  dispose(): void;
}
