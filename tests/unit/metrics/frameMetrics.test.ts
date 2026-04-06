import { describe, it, expect, beforeEach } from 'vitest';
import { FrameMetrics } from '@/lib/metrics/frameMetrics';

describe('FrameMetrics', () => {
  let metrics: FrameMetrics;

  beforeEach(() => {
    metrics = new FrameMetrics();
  });

  it('snapshot returns zeros when empty', () => {
    const snap = metrics.snapshot();
    expect(snap.frameCount).toBe(0);
    expect(snap.avgMs).toBe(0);
    expect(snap.avgFps).toBe(0);
  });

  it('records frames and computes avg correctly', () => {
    // Simulate 100 frames at 16.67ms (60fps)
    for (let i = 0; i < 100; i++) {
      metrics.record(0.01667);
    }
    const snap = metrics.snapshot();
    expect(snap.frameCount).toBe(100);
    expect(snap.avgMs).toBeCloseTo(16.67, 0);
    expect(snap.avgFps).toBeCloseTo(60, -1);
  });

  it('computes p95 and p99 percentiles', () => {
    // 95 frames at 16ms, 5 frames at 50ms
    for (let i = 0; i < 95; i++) metrics.record(0.016);
    for (let i = 0; i < 5; i++) metrics.record(0.050);
    const snap = metrics.snapshot();
    expect(snap.p95Ms).toBeGreaterThanOrEqual(16);
    expect(snap.maxMs).toBeCloseTo(50, 0);
  });

  it('rolling window caps at WINDOW_SIZE', () => {
    // Record more than window size
    for (let i = 0; i < 400; i++) {
      metrics.record(0.016);
    }
    const snap = metrics.snapshot();
    expect(snap.frameCount).toBe(300); // WINDOW_SIZE
  });

  it('tracks avatar count and draw calls', () => {
    metrics.setAvatarCount(42);
    metrics.setDrawCalls(128);
    metrics.record(0.016);
    const snap = metrics.snapshot();
    expect(snap.avatarCount).toBe(42);
    expect(snap.drawCalls).toBe(128);
  });

  it('reset clears all data', () => {
    for (let i = 0; i < 50; i++) metrics.record(0.016);
    metrics.reset();
    expect(metrics.snapshot().frameCount).toBe(0);
  });
});
