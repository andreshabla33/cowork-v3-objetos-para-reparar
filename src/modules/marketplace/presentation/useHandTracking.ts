/**
 * @module modules/marketplace/presentation/useHandTracking
 *
 * React hook driving a HandLandmarkerAdapter against a video element.
 *
 * Clean Architecture: presentation layer. Owns the rAF loop and the adapter
 * lifecycle; emits each detection via `onResult` to avoid React state churn
 * at 30+ FPS.
 *
 * Doc oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */

import { useEffect, useRef, useState } from 'react';
import {
  HandLandmarkerAdapter,
  type HandLandmarkerAdapterOptions,
  type HandLandmarkerOutput,
} from '@/core/infrastructure/mediapipe/HandLandmarkerAdapter';

export interface UseHandTrackingParams {
  /** Ref to the video element being processed. Caller wires srcObject + play(). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether tracking is active. */
  enabled: boolean;
  /** Called once per new detection. Prefer this over polling state. */
  onResult: (result: HandLandmarkerOutput, timestampMs: number) => void;
  /** Optional adapter overrides (model URL, numHands, thresholds). Should be stable. */
  adapterOptions?: HandLandmarkerAdapterOptions;
}

export interface UseHandTrackingReturn {
  /** True once the adapter finished init() and the rAF loop is running. */
  ready: boolean;
  /** Last initialization or runtime error, if any. */
  error: string | null;
}

export function useHandTracking({
  videoRef,
  enabled,
  onResult,
  adapterOptions,
}: UseHandTrackingParams): UseHandTrackingReturn {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!enabled) return;
    const adapter = new HandLandmarkerAdapter();
    let cancelled = false;
    let rafId = 0;

    const loop = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const result = adapter.detect(video, performance.now());
          if (result) onResultRef.current(result, performance.now());
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    adapter
      .init(adapterOptions)
      .then(() => {
        if (cancelled) {
          adapter.dispose();
          return;
        }
        setReady(true);
        rafId = requestAnimationFrame(loop);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      adapter.dispose();
      setReady(false);
    };
  }, [enabled, videoRef, adapterOptions]);

  return { ready, error };
}
