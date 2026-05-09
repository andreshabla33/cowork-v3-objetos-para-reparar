/**
 * FrameMetrics — lightweight frame-time tracker for 3D runtime observability.
 *
 * Accumulates per-frame delta times, computes rolling stats (avg, p95, p99),
 * and exposes a snapshot for diagnostics / performance panels.
 *
 * Designed for useFrame integration — call `record(delta)` each frame.
 * Periodically call `snapshot()` to read metrics (e.g. every 5 seconds).
 */

export interface FrameMetricsSnapshot {
  frameCount: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  avgFps: number;
  avatarCount: number;
  drawCalls: number;
  heapUsedMB: number;
}

const WINDOW_SIZE = 300; // ~5 seconds at 60fps

export class FrameMetrics {
  private deltas: Float32Array = new Float32Array(WINDOW_SIZE);
  private index = 0;
  private count = 0;
  private _avatarCount = 0;
  private _drawCalls = 0;

  record(deltaSec: number): void {
    this.deltas[this.index] = deltaSec * 1000; // store as ms
    this.index = (this.index + 1) % WINDOW_SIZE;
    if (this.count < WINDOW_SIZE) this.count++;
  }

  setAvatarCount(n: number): void {
    this._avatarCount = n;
  }

  setDrawCalls(n: number): void {
    this._drawCalls = n;
  }

  snapshot(): FrameMetricsSnapshot {
    if (this.count === 0) {
      return {
        frameCount: 0,
        avgMs: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        avgFps: 0,
        avatarCount: this._avatarCount,
        drawCalls: this._drawCalls,
        heapUsedMB: this.getHeapMB(),
      };
    }

    // Copy active window and sort for percentiles
    const active = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      active[i] = this.deltas[i];
    }
    active.sort();

    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += active[i];

    const avg = sum / this.count;
    const p95 = active[Math.floor(this.count * 0.95)];
    const p99 = active[Math.floor(this.count * 0.99)];
    const max = active[this.count - 1];

    return {
      frameCount: this.count,
      avgMs: Math.round(avg * 100) / 100,
      p95Ms: Math.round(p95 * 100) / 100,
      p99Ms: Math.round(p99 * 100) / 100,
      maxMs: Math.round(max * 100) / 100,
      avgFps: avg > 0 ? Math.round(1000 / avg) : 0,
      avatarCount: this._avatarCount,
      drawCalls: this._drawCalls,
      heapUsedMB: this.getHeapMB(),
    };
  }

  reset(): void {
    this.index = 0;
    this.count = 0;
  }

  private getHeapMB(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return Math.round(((performance as any).memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
    }
    return 0;
  }
}

/** Singleton for the 3D runtime */
export const frameMetrics = new FrameMetrics();
