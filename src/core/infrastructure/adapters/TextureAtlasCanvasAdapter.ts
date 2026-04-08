/**
 * @module core/infrastructure/adapters/TextureAtlasCanvasAdapter
 * @description Infrastructure adapter: Canvas2D texture atlas implementation.
 *
 * Clean Architecture: Infrastructure layer — implements ITextureAtlasService.
 * This is the ONLY file in the project that creates HTMLCanvasElement for atlas compositing.
 *
 * Problem solved (Fase 3):
 *   Each unique texture = 1 GPU texture bind per draw call.
 *   Consolidating textures into a single atlas reduces texture switches
 *   and enables sharing a single material across many objects.
 *
 * Strategy: Canvas2D compositing (flexible dimensions).
 *   Alternative (Array Textures) preferred when all textures have equal dimensions
 *   because it eliminates edge bleeding and supports native wrapping/tiling.
 *
 * Atlas layout:
 *   - Max size: 4096×4096 (universally supported on all GPU tiers)
 *   - Packing: simple shelf/row algorithm (left-to-right, top-to-bottom)
 *   - Format: CanvasTexture → sRGBEncoding for PBR materials
 *
 * Ref: Three.js r152+ — texture.channel (multi-UV support)
 *   https://threejs.org/docs/#api/en/textures/Texture.channel
 *
 * Ref: Three.js CanvasTexture
 *   https://threejs.org/docs/#api/en/textures/CanvasTexture
 */

import * as THREE from 'three';
import type {
  ITextureAtlasService,
  AtlasRegion,
  UVTransform,
  AtlasStats,
} from '../../domain/ports/ITextureAtlasService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ATLAS_SIZE = 4096;
const PADDING = 2; // pixels between textures to prevent bleeding

// ─── Internal types ───────────────────────────────────────────────────────────

interface AtlasEntry {
  imageSource: HTMLImageElement | ImageBitmap;
  region: AtlasRegion;
  pixelX: number;
  pixelY: number;
  pixelW: number;
  pixelH: number;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class TextureAtlasCanvasAdapter implements ITextureAtlasService {
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _texture: THREE.CanvasTexture | null = null;

  private readonly _entries = new Map<string, AtlasEntry>();

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  private _ensureCanvas(): void {
    if (!this._canvas) {
      this._canvas = document.createElement('canvas');
      this._canvas.width = MAX_ATLAS_SIZE;
      this._canvas.height = MAX_ATLAS_SIZE;
      this._ctx = this._canvas.getContext('2d');
      this._texture = new THREE.CanvasTexture(this._canvas);
      this._texture.colorSpace = THREE.SRGBColorSpace;
    }
  }

  dispose(): void {
    this._texture?.dispose();
    this._texture = null;
    this._canvas = null;
    this._ctx = null;
    this._entries.clear();
  }

  // ─── Texture management ──────────────────────────────────────────────────────

  addTexture(key: string, imageSource: unknown): AtlasRegion {
    this._ensureCanvas();

    if (this._entries.has(key)) {
      return this._entries.get(key)!.region;
    }

    const img = imageSource as HTMLImageElement | ImageBitmap;
    const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;

    // Placeholder region — will be computed during pack()
    const region: AtlasRegion = { u: 0, v: 0, width: w / MAX_ATLAS_SIZE, height: h / MAX_ATLAS_SIZE };
    this._entries.set(key, { imageSource: img, region, pixelX: 0, pixelY: 0, pixelW: w, pixelH: h });

    return region;
  }

  hasTexture(key: string): boolean {
    return this._entries.has(key);
  }

  getRegion(key: string): AtlasRegion | null {
    return this._entries.get(key)?.region ?? null;
  }

  getUVTransform(key: string): UVTransform | null {
    const entry = this._entries.get(key);
    if (!entry) return null;
    const { u, v, width, height } = entry.region;
    return { offsetX: u, offsetY: 1 - v - height, scaleX: width, scaleY: height };
  }

  getAtlasTexture(): unknown {
    this._ensureCanvas();
    return this._texture;
  }

  removeTexture(key: string): void {
    this._entries.delete(key);
  }

  // ─── Packing ─────────────────────────────────────────────────────────────────

  /**
   * Simple shelf packing algorithm.
   * Iterates entries left-to-right, advances to next row when width overflows.
   */
  pack(): void {
    this._ensureCanvas();
    if (!this._ctx || !this._canvas || !this._texture) return;

    // Clear the canvas
    this._ctx.clearRect(0, 0, MAX_ATLAS_SIZE, MAX_ATLAS_SIZE);

    let cursorX = PADDING;
    let cursorY = PADDING;
    let rowHeight = 0;

    for (const [, entry] of this._entries) {
      const { pixelW, pixelH, imageSource } = entry;

      // Advance to next row if needed
      if (cursorX + pixelW + PADDING > MAX_ATLAS_SIZE) {
        cursorX = PADDING;
        cursorY += rowHeight + PADDING;
        rowHeight = 0;
      }

      // Draw the image
      this._ctx.drawImage(imageSource as CanvasImageSource, cursorX, cursorY, pixelW, pixelH);

      // Update region (normalized UV coordinates)
      entry.pixelX = cursorX;
      entry.pixelY = cursorY;
      entry.region.u = cursorX / MAX_ATLAS_SIZE;
      entry.region.v = cursorY / MAX_ATLAS_SIZE;
      entry.region.width = pixelW / MAX_ATLAS_SIZE;
      entry.region.height = pixelH / MAX_ATLAS_SIZE;

      cursorX += pixelW + PADDING;
      if (pixelH > rowHeight) rowHeight = pixelH;
    }

    // Signal Three.js to re-upload the canvas to the GPU
    this._texture.needsUpdate = true;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats(): AtlasStats {
    let usedPixels = 0;
    for (const entry of this._entries.values()) {
      usedPixels += entry.pixelW * entry.pixelH;
    }
    const totalPixels = MAX_ATLAS_SIZE * MAX_ATLAS_SIZE;
    return {
      textureCount: this._entries.size,
      atlasSize: MAX_ATLAS_SIZE,
      usagePercent: totalPixels > 0 ? (usedPixels / totalPixels) * 100 : 0,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: TextureAtlasCanvasAdapter | null = null;

export function getTextureAtlasAdapter(): TextureAtlasCanvasAdapter {
  if (!_instance) {
    _instance = new TextureAtlasCanvasAdapter();
  }
  return _instance;
}

export function resetTextureAtlasAdapter(): void {
  _instance?.dispose();
  _instance = null;
}
