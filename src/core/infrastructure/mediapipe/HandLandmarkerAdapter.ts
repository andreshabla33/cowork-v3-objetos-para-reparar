/**
 * @module core/infrastructure/mediapipe/HandLandmarkerAdapter
 *
 * Encapsulates @mediapipe/tasks-vision HandLandmarker for hand-tracking use cases.
 *
 * Clean Architecture: Infrastructure layer adapter. UI does not import
 * @mediapipe/* directly — consumes via useHandTracking hook.
 *
 * Doc oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';

export interface HandLandmarkerAdapterOptions {
  /** URL base for the tasks-vision WASM bundle. Defaults to jsdelivr pinned to 0.10.x. */
  wasmBasePath?: string;
  /** URL of the hand_landmarker.task model. Defaults to Google's official storage. */
  modelAssetPath?: string;
  /** Max number of hands to detect (1..2). */
  numHands?: number;
  /** Detection confidence threshold (0..1). */
  minHandDetectionConfidence?: number;
  /** Tracking confidence threshold (0..1). */
  minTrackingConfidence?: number;
  /** Presence confidence threshold (0..1). */
  minHandPresenceConfidence?: number;
}

const DEFAULT_OPTIONS: Required<HandLandmarkerAdapterOptions> = {
  wasmBasePath:
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm',
  modelAssetPath:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  numHands: 2,
  minHandDetectionConfidence: 0.7,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

export type HandLandmarkerOutput = HandLandmarkerResult;

export class HandLandmarkerAdapter {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;

  /** Initialize the WASM runtime and create the underlying HandLandmarker. */
  async init(options: HandLandmarkerAdapterOptions = {}): Promise<void> {
    if (this.landmarker) return;
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const vision = await FilesetResolver.forVisionTasks(opts.wasmBasePath);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: opts.modelAssetPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: opts.numHands,
      minHandDetectionConfidence: opts.minHandDetectionConfidence,
      minHandPresenceConfidence: opts.minHandPresenceConfidence,
      minTrackingConfidence: opts.minTrackingConfidence,
    });
  }

  /**
   * Detect landmarks from a video frame. Returns null if the frame timestamp
   * has not advanced since the last call (avoids redundant inference).
   */
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerOutput | null {
    if (!this.landmarker) {
      throw new Error('HandLandmarkerAdapter not initialized — call init() first.');
    }
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    return this.landmarker.detectForVideo(video, timestampMs);
  }

  /** Tear down the underlying landmarker and free its WASM resources. */
  dispose(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
      this.lastVideoTime = -1;
    }
  }
}
