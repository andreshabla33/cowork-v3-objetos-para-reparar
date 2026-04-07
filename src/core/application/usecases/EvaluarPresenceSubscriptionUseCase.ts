/**
 * @module core/application/usecases/EvaluarPresenceSubscriptionUseCase
 * @description Application Use Case — evaluates whether presence channel
 * subscriptions should be updated and with what radius.
 *
 * Clean Architecture: Application layer — orchestrates domain policy.
 * No infrastructure imports (no Supabase, no Three.js).
 *
 * Problem solved:
 *   With 500+ avatars and radio=2, each user opens up to 50 Supabase channels.
 *   This use case implements adaptive radius reduction based on avatar density
 *   and aggressive throttling to minimize channel churn.
 *
 * Ref: Supabase Realtime Pricing — $2.50/1M msgs, each track() = 1 + N msgs.
 * Ref: Three.js LOD — beyond CULL_DISTANCE (100wu), avatars are spheres;
 *       no need for rich presence data at that range.
 */

import type {
  IPresenceSubscriptionPolicy,
  PresenceSubscriptionConfig,
  PresenceSubscriptionDecision,
} from '../../domain/ports/IPresenceSubscriptionPolicy';
import { PRESENCE_DEFAULTS } from '../../domain/ports/IPresenceSubscriptionPolicy';

// ─── Use Case Implementation ─────────────────────────────────────────────────

export class EvaluarPresenceSubscriptionUseCase implements IPresenceSubscriptionPolicy {
  private readonly config: PresenceSubscriptionConfig;

  constructor(config: Partial<PresenceSubscriptionConfig> = {}) {
    this.config = { ...PRESENCE_DEFAULTS, ...config };
  }

  /**
   * Evaluate whether to sync presence channels and compute optimal radius.
   *
   * Algorithm:
   * 1. Throttle: skip if last sync was < syncThrottleMs ago
   * 2. Adaptive radius: reduce if nearby avatar count > threshold
   * 3. Compute chunk keys for the effective radius
   *
   * @param x           World X position
   * @param y           World Y position
   * @param nearbyCount Currently tracked nearby avatars
   * @param lastSyncMs  Timestamp of last successful sync
   */
  evaluate(
    x: number,
    y: number,
    nearbyCount: number,
    lastSyncMs: number,
  ): PresenceSubscriptionDecision {
    const now = Date.now();

    // 1. Throttle — prevent channel churn during rapid movement
    if (now - lastSyncMs < this.config.syncThrottleMs) {
      return { radius: 0, desiredChunks: [], shouldSkip: true };
    }

    // 2. Adaptive radius based on density
    let effectiveRadius = this.config.baseRadius;

    if (nearbyCount > this.config.densityThresholdForReduction) {
      // High density: reduce radius to minimize channels
      // Each extra radius ring adds (2r+1)² - (2(r-1)+1)² channels
      effectiveRadius = Math.max(0, effectiveRadius - 1);
    } else if (nearbyCount < 20 && effectiveRadius < this.config.maxRadius) {
      // Very sparse: could expand to catch distant avatars
      // But ONLY if total channel count stays reasonable
      effectiveRadius = Math.min(effectiveRadius + 1, this.config.maxRadius);
    }

    // 3. Compute chunk keys
    const cx = Math.floor(x / this.config.chunkSize);
    const cy = Math.floor(y / this.config.chunkSize);
    const desiredChunks: string[] = [];

    for (let dx = -effectiveRadius; dx <= effectiveRadius; dx++) {
      for (let dy = -effectiveRadius; dy <= effectiveRadius; dy++) {
        desiredChunks.push(`chunk_${cx + dx}_${cy + dy}`);
      }
    }

    return {
      radius: effectiveRadius,
      desiredChunks,
      shouldSkip: false,
    };
  }

  /**
   * Check if a track() update should be throttled.
   *
   * @param lastTrackMs Timestamp of last track() call
   * @returns true if enough time has passed for a new track()
   */
  shouldTrack(lastTrackMs: number): boolean {
    return Date.now() - lastTrackMs >= this.config.trackThrottleMs;
  }

  /** Expose config for testing/debugging */
  getConfig(): Readonly<PresenceSubscriptionConfig> {
    return this.config;
  }
}
