import { describe, expect, it, vi, beforeEach } from 'vitest';

// Regression coverage for the "camera flickers twice on publish" fix
// (2026-05-08). The fix in `useLiveKitLocalPublishing.ts` removes
// `realtimeCoordinatorState` from `getPublishedVideoTrack`'s deps so the
// callback identity stays STABLE across coordinator state changes. That
// removal is only safe if the wrapper LiveKit publishes is the SAME JS
// object that `useLocalCameraTrack` returns for preview — otherwise the
// consumer's `resolveActiveVideoTrack` would silently switch wrappers and
// the processor pipeline would never be re-attached on publish.
//
// The contract that guarantees "preview wrapper === published wrapper"
// lives in `LocalVideoTrackFactory`:
//   1. `wrapRawTrack(mst)` is idempotent per MST id (cache).
//   2. `resolveForPublish(mst, 'camera')` delegates to `wrapRawTrack` so
//      the publish path hits the same cache entry.
//   3. Already-wrapped tracks pass through unchanged.
//
// If any of these break, the publish path would create a different
// LocalVideoTrack, the consumer's `resolveActiveVideoTrack` would return
// a different reference at publish time, and the camera-flicker
// regression would resurface. This file pins all three.

// LiveKit's real `LocalVideoTrack` constructor reaches into MediaPipe and
// browser internals that jsdom can't satisfy. We swap it for a class
// double that records the rawTrack so identity assertions remain valid.
vi.mock('livekit-client', () => {
  class LocalVideoTrack {
    public readonly mediaStreamTrack: MediaStreamTrack;
    constructor(rawTrack: MediaStreamTrack) {
      this.mediaStreamTrack = rawTrack;
    }
  }
  return { LocalVideoTrack };
});

import {
  LocalVideoTrackFactory,
  getLocalVideoTrackFactory,
} from '../../../src/core/infrastructure/adapters/LocalVideoTrackFactory';
import type { VideoTrackHandle } from '../../../src/core/domain/types/media';

// Minimal MediaStreamTrack stand-in: only the fields the factory touches
// (`id` + `addEventListener('ended')`).
function makeFakeMst(id: string): MediaStreamTrack {
  const listeners: Record<string, Array<() => void>> = {};
  const mst = {
    id,
    addEventListener: vi.fn((event: string, fn: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    }),
    dispatchEvent: (event: string): void => {
      (listeners[event] || []).forEach((fn) => fn());
    },
  };
  return mst as unknown as MediaStreamTrack;
}

describe('LocalVideoTrackFactory — preview/publish wrapper identity', () => {
  let factory: LocalVideoTrackFactory;

  beforeEach(() => {
    factory = new LocalVideoTrackFactory();
  });

  describe('wrapRawTrack idempotency', () => {
    it('returns the SAME wrapper instance on repeated calls for the same MST id', () => {
      const mst = makeFakeMst('mst-camera-1');

      const first = factory.wrapRawTrack(mst);
      const second = factory.wrapRawTrack(mst);

      expect(second).toBe(first);
    });

    it('returns DIFFERENT wrappers for different MST ids', () => {
      const a = factory.wrapRawTrack(makeFakeMst('mst-A'));
      const b = factory.wrapRawTrack(makeFakeMst('mst-B'));

      expect(a).not.toBe(b);
    });

    it('clears the cached wrapper when the MST fires "ended"', () => {
      const mst = makeFakeMst('mst-ends');
      const before = factory.wrapRawTrack(mst);

      (mst as unknown as { dispatchEvent: (e: string) => void }).dispatchEvent('ended');

      const after = factory.wrapRawTrack(mst);
      expect(after).not.toBe(before);
    });
  });

  describe('resolveForPublish — camera path hits the same cache as preview', () => {
    it('handle returned by resolveForPublish resuelve al wrapper de wrapRawTrack', () => {
      const mst = makeFakeMst('mst-publish-camera');

      const previewWrapper = factory.wrapRawTrack(mst);
      const publishHandle = factory.resolveForPublish(mst, 'camera');

      // Post Fase 0.1: resolveForPublish para source='camera' devuelve un
      // VideoTrackHandle (Domain) que el adapter resuelve a LocalVideoTrack.
      // Invariante crítico: resolveNative(handle) === el wrapper de
      // wrapRawTrack. Si esto se rompe, el flicker de cámara del bugfix
      // 2026-04-07 reaparece.
      const handle = publishHandle as VideoTrackHandle;
      expect(handle.kind).toBe('camera');
      const resolved = factory.resolveNative(handle);
      expect(resolved).toBe(previewWrapper);
    });

    it('handle stable cuando resolveForPublish corre PRIMERO', () => {
      const mst = makeFakeMst('mst-publish-first');

      const publishHandle = factory.resolveForPublish(mst, 'camera');
      const previewWrapper = factory.wrapRawTrack(mst);

      const handle = publishHandle as VideoTrackHandle;
      expect(handle.kind).toBe('camera');
      const resolved = factory.resolveNative(handle);
      expect(resolved).toBe(previewWrapper);
    });

    it('handle existente pasa tal cual (no rewrap)', () => {
      const mst = makeFakeMst('mst-prewrapped');
      factory.wrapRawTrack(mst);
      const handle = factory.handleFor(mst, 'camera');

      const result = factory.resolveForPublish(handle, 'camera');

      expect(result).toBe(handle);
    });
  });

  describe('singleton', () => {
    it('getLocalVideoTrackFactory returns a stable instance across calls', () => {
      expect(getLocalVideoTrackFactory()).toBe(getLocalVideoTrackFactory());
    });
  });
});
