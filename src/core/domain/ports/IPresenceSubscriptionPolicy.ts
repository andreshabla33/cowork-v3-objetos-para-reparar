/**
 * @module core/domain/ports/IPresenceSubscriptionPolicy
 * @description Domain port that defines how presence subscriptions are managed
 * based on spatial proximity and avatar density.
 *
 * Clean Architecture: Domain layer — pure interface, no infrastructure deps.
 *
 * Problem solved:
 *   With 500+ avatars, subscribing to too many presence channels creates
 *   excessive network traffic and Supabase message billing. This policy
 *   adapts the subscription radius based on local avatar density.
 *
 * Ref: Supabase Realtime Pricing — each track() = 1 sent + N received msgs.
 *      At 500 users × 50 channels = 25,000 subscriptions. Must reduce.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Adaptive presence subscription configuration.
 * Adjusts based on observed avatar density to prevent channel explosion.
 */
export interface PresenceSubscriptionConfig {
  /** Chunk size in world units (must match chunkSystem) */
  readonly chunkSize: number;

  /**
   * Base radius for chunk subscriptions (in chunk units).
   * radius=1 → 9 chunks (3×3), radius=2 → 25 chunks (5×5)
   *
   * IMPORTANT: Reduced from 2 → 1 for 500+ avatar scalability.
   * At 200wu chunks, radius=1 covers 600×600wu = sufficient for LOD_MID_DISTANCE (60wu).
   */
  readonly baseRadius: number;

  /**
   * Maximum radius allowed (never exceed this even with low density).
   * Prevents excessive channel subscriptions.
   */
  readonly maxRadius: number;

  /**
   * If nearby avatar count exceeds this, reduce radius to minimize channels.
   * Supabase charges per message: fewer channels = fewer messages.
   */
  readonly densityThresholdForReduction: number;

  /**
   * Minimum interval (ms) between syncPresenceByChunk calls.
   * Prevents rapid channel creation/destruction during movement.
   */
  readonly syncThrottleMs: number;

  /**
   * Minimum interval (ms) between presence track() updates.
   * Each track() call = 1 outbound message per channel.
   */
  readonly trackThrottleMs: number;
}

// ─── Policy Result ───────────────────────────────────────────────────────────

export interface PresenceSubscriptionDecision {
  /** Effective radius to use for this sync cycle */
  radius: number;
  /** Chunk keys to subscribe to */
  desiredChunks: string[];
  /** Whether this sync should be skipped (throttled) */
  shouldSkip: boolean;
}

// ─── Port Interface ──────────────────────────────────────────────────────────

export interface IPresenceSubscriptionPolicy {
  /**
   * Decide subscription radius and chunks based on current position and density.
   *
   * @param x           Current world X position
   * @param y           Current world Y position
   * @param nearbyCount Number of avatars currently tracked in nearby chunks
   * @param lastSyncMs  Timestamp of last successful sync (for throttling)
   * @returns           Decision with effective radius, chunk keys, and throttle flag
   */
  evaluate(
    x: number,
    y: number,
    nearbyCount: number,
    lastSyncMs: number,
  ): PresenceSubscriptionDecision;
}

// ─── Default Configuration ───────────────────────────────────────────────────

/**
 * Production defaults optimized for 500+ concurrent avatars.
 *
 * Justification (Supabase docs):
 * - Pro plan: 500 peak connections, 5M messages/month
 * - Each channel.track() = 1 sent msg + N received per subscriber
 * - radius=1 → 9 chunks × 2 types = 18 channels max (vs 50 at radius=2)
 * - 18 channels × 500 users = 9,000 subs (vs 25,000) = 64% reduction
 *
 * Justification (Three.js LOD):
 * - LOD_MID_DISTANCE = 60wu, CULL_DISTANCE = 100wu
 * - radius=1 at CHUNK_SIZE=200 covers 600×600wu = 6× cull distance
 * - Avatars beyond this are LOW LOD (spheres) and don't need rich presence
 */
export const PRESENCE_DEFAULTS: PresenceSubscriptionConfig = {
  chunkSize: 200,
  baseRadius: 1,
  maxRadius: 2,
  densityThresholdForReduction: 100,
  syncThrottleMs: 2_000,
  trackThrottleMs: 5_000,
};
