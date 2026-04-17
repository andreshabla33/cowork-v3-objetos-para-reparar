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
 * Production defaults tuned para 100 concurrent users en Supabase Pro plan.
 *
 * Presupuesto (Supabase Realtime Pro):
 * - 50 presence msgs/s hard limit with spend cap on
 *   (https://supabase.com/docs/guides/realtime/quotas)
 * - 5M messages/month included, $2.50 per 1M over
 *
 * Cuentas billables: cada track() = 1 msg enviado + N recibidos por suscriptor
 * (https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).
 *
 * Estrategia (update 2026-04-17 para target 100 users):
 * - baseRadius=0: solo el chunk actual + global empresa discovery channel.
 *   Con densidades altas el global channel ya entrega discovery entre miembros
 *   de misma empresa; los chunks de anillo exterior son casi ruido.
 *   maxRadius=1 permite expansión adaptativa SOLO cuando la densidad es baja.
 * - trackThrottleMs=45_000 (antes 15_000): con 100 users × 3 canales / 45s =
 *   ~6.7 msgs/s ENVIADOS, bien por debajo del 50/s. Proyección mensual 8h/día
 *   × ~5 receivers por canal = ~15M msgs/mes (vs 5M incluidos → ~$25/mes extra,
 *   manejable). Con trackThrottle anterior (15s) la proyección era ~47M/mes.
 * - densityThresholdForReduction=30 (antes 100): colapsa radius a 0 mucho
 *   antes, así en escenarios densos no se expande a 9 chunks por accidente.
 * - Toggles status/cam/mic pueden tardar ≤45s por Realtime; la señal
 *   autoritativa en sala 3D viaja por LiveKit DataPackets (instantánea),
 *   así que Realtime solo sirve para discovery fuera de sala.
 *
 * Justificación Three.js LOD:
 * - LOD_MID_DISTANCE = 60wu, CULL_DISTANCE = 100wu
 * - radius=0 at CHUNK_SIZE=200 cubre ~200×200wu = 2× cull distance dentro
 *   del chunk actual; avatares de chunks vecinos entran via global channel
 *   (empresa) o simplemente no se renderizan hasta acercarse.
 */
export const PRESENCE_DEFAULTS: PresenceSubscriptionConfig = {
  chunkSize: 200,
  baseRadius: 0,
  // maxRadius=1 permite que la regla de density-expansion (nearbyCount<20)
  // eleve el radio a 1 solo cuando el espacio está realmente vacío — evita
  // perder awareness periférica en sesiones pequeñas sin inflar el pool
  // cuando hay densidad normal.
  maxRadius: 1,
  // Baja densidad → colapsar antes a radius 0. Con 30 nearby users ya no
  // merece la pena expandir el anillo exterior (mensajería Realtime > ROI).
  densityThresholdForReduction: 30,
  syncThrottleMs: 2_000,
  // 45s track throttle — optimizado para 100 users concurrentes dentro del
  // plan Pro (5M msgs/mes). Comportamiento de sala (animaciones, gestos,
  // posición) viaja por LiveKit DataPackets, que NO cuenta contra Realtime
  // quota, así que este valor solo afecta discovery fuera del radio LiveKit.
  trackThrottleMs: 45_000,
};
