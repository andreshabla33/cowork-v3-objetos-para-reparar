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
    it('returns the wrapper produced earlier by wrapRawTrack (raw MST input)', () => {
      const mst = makeFakeMst('mst-publish-camera');

      const previewWrapper = factory.wrapRawTrack(mst);
      const publishWrapper = factory.resolveForPublish(mst, 'camera');

      // Critical invariant — same JS object. If this ever breaks, the
      // "stable identity" assumption in `getPublishedVideoTrack` is
      // wrong and the camera flicker regression resurfaces.
      expect(publishWrapper).toBe(previewWrapper);
    });

    it('still returns the cached wrapper when resolveForPublish is called FIRST', () => {
      // Mirror image: publish path can run before the preview hook does.
      // The cache must still serve the same instance to the later preview.
      const mst = makeFakeMst('mst-publish-first');

      const publishWrapper = factory.resolveForPublish(mst, 'camera');
      const previewWrapper = factory.wrapRawTrack(mst);

      expect(previewWrapper).toBe(publishWrapper);
    });

    it('passes already-wrapped LocalVideoTrack through unchanged', () => {
      const mst = makeFakeMst('mst-prewrapped');
      const wrapper = factory.wrapRawTrack(mst);

      const result = factory.resolveForPublish(wrapper, 'camera');

      expect(result).toBe(wrapper);
    });
  });

  describe('singleton', () => {
    it('getLocalVideoTrackFactory returns a stable instance across calls', () => {
      expect(getLocalVideoTrackFactory()).toBe(getLocalVideoTrackFactory());
    });
  });
});
