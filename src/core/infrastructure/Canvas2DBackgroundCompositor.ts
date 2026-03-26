/**
 * @module infrastructure/Canvas2DBackgroundCompositor
 * Fallback compositor using Canvas 2D API.
 * Used when WebGL is not available.
 * 
 * Slower than WebGL but works everywhere.
 */

import type {
  IBackgroundCompositor,
  CompositorConfig,
} from '../domain/ports/IBackgroundCompositor';

export class Canvas2DBackgroundCompositor implements IBackgroundCompositor {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private _isReady = false;
  private config: CompositorConfig | null = null;
  private backgroundImage: ImageBitmap | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(config: CompositorConfig): Promise<void> {
    this.config = config;
    this.canvas = document.createElement('canvas');
    this.canvas.width = config.width;
    this.canvas.height = config.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d')!;
    this._isReady = true;
    console.log(`[Canvas2DCompositor] Ready (fallback) ${config.width}×${config.height}`);
  }

  composite(
    image: HTMLVideoElement | ImageBitmap,
    mask: Uint8Array,
    maskWidth: number,
    maskHeight: number,
  ): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas || !this.config) return;

    const w = canvas.width;
    const h = canvas.height;

    // Build mask canvas
    const mc = this.maskCanvas!;
    if (mc.width !== maskWidth || mc.height !== maskHeight) {
      mc.width = maskWidth;
      mc.height = maskHeight;
    }
    const imageData = this.maskCtx!.createImageData(maskWidth, maskHeight);
    const d = imageData.data;
    for (let i = 0; i < mask.length; i++) {
      const alpha = mask[i] === 0 ? 255 : 0; // bg = white, person = transparent
      const idx = i * 4;
      d[idx] = 255;
      d[idx + 1] = 255;
      d[idx + 2] = 255;
      d[idx + 3] = alpha;
    }
    this.maskCtx!.putImageData(imageData, 0, 0);

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (this.config.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    if (this.config.effectType === 'blur') {
      ctx.filter = `blur(${this.config.blurRadius}px)`;
      ctx.drawImage(image, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(mc, 0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(image, 0, 0, w, h);
    } else if (this.config.effectType === 'image' && this.backgroundImage) {
      ctx.drawImage(mc, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(image, 0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-over';
      if (this.config.mirror) {
        ctx.scale(-1, 1);
        ctx.translate(-w, 0);
      }
      ctx.drawImage(this.backgroundImage, 0, 0, w, h);
    } else {
      ctx.drawImage(image, 0, 0, w, h);
    }

    ctx.restore();
  }

  setBackgroundImage(bitmap: ImageBitmap): void {
    this.backgroundImage = bitmap;
  }

  updateConfig(partial: Partial<CompositorConfig>): void {
    if (!this.config) return;
    Object.assign(this.config, partial);
    if ((partial.width || partial.height) && this.canvas) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas!;
  }

  dispose(): void {
    this.ctx = null;
    this.canvas = null;
    this._isReady = false;
    this.backgroundImage = null;
    this.maskCanvas = null;
    this.maskCtx = null;
  }
}
