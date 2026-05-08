/**
 * @module modules/realtime-room/domain/PresencePositionPolicy
 *
 * Pure domain helpers that interpret the spatial fields of a Supabase Realtime
 * presence payload as a position in world coordinates. Centralizes the
 * `(0, 0)` sentinel contract so the hook layer cannot accidentally fabricate
 * a fake position from absent / sentinel values.
 *
 * # The (0, 0) sentinel contract
 *
 * The codebase uses `(x, y) = (0, 0)` as the canonical sentinel for "the
 * remote participant's position has not been hydrated yet" or "the remote
 * participant has `privacy.showLocationInSpace = false` and is broadcasting
 * a redacted location". Producers and consumers MUST agree:
 *
 *  - Producer (`hooks/workspace/usePresenceChannels.ts:trackPresenceEnCanal`)
 *    sends `x: 0, y: 0` whenever location privacy is off OR the local
 *    `currentUser.x/y` is still at the auth-slice default (which is itself
 *    `(0, 0)` since the 2026-05-08 fix at `store/slices/authSlice.ts:55-56`).
 *
 *  - Consumer (`hooks/space3d/useProximity.ts:229,246,367`) filters every
 *    user that satisfies `(u.x === 0 && u.y === 0)` from proximity / audio
 *    / spatial-hash candidate sets — the sentinel must reach the consumer
 *    intact for that filter to fire.
 *
 *  - Mapper (this file) MUST NOT collapse `0` to a non-zero default. Doing
 *    so (e.g. via JS `||`) breaks the consumer filter and turns "no
 *    position" into "fake position at the chosen default", which is a
 *    proximity-fantasma class of bug — historically seen in the
 *    `2026-04-22` and `2026-05-08` reports.
 *
 * # Refs
 * - https://supabase.com/docs/guides/realtime/presence — payload shape.
 * - `hooks/space3d/useProximity.ts:229,246,367` — sentinel filter.
 * - `store/slices/authSlice.ts:48-65` — sender-side sentinel default.
 *
 * Clean Architecture: pure Domain — no Supabase / React imports.
 */

/**
 * Subset of the Supabase Realtime presence payload that carries spatial
 * information. We accept anything with optional `x` / `y` fields so this
 * helper stays decoupled from the full `PresencePayload` type.
 */
export interface PresenceSpatialPayload {
  x?: number | null;
  y?: number | null;
}

/**
 * World-coordinate position derived from a presence payload, with the
 * `(0, 0)` sentinel preserved verbatim.
 */
export interface PresencePosition {
  x: number;
  y: number;
}

/**
 * Map a presence payload's spatial fields to world coordinates.
 *
 * Contract:
 *   - `x === 0` (or `y === 0`) is preserved as `0` (sentinel — see file header).
 *   - Negative numbers are preserved (the world is centered around the origin
 *     and large regions live in the negative quadrant).
 *   - `undefined` / `null` / non-finite values fall through to `0` so the
 *     consumer filter still classifies the user as "no position".
 *
 * Crucially: this helper does NOT use `||` for defaulting, because `0 || N`
 * evaluates to `N`, which would fabricate a fake position when the producer
 * sent the sentinel.
 */
export function extractPresencePosition(payload: PresenceSpatialPayload): PresencePosition {
  return {
    x: typeof payload.x === 'number' && Number.isFinite(payload.x) ? payload.x : 0,
    y: typeof payload.y === 'number' && Number.isFinite(payload.y) ? payload.y : 0,
  };
}

/**
 * Whether a position equals the `(0, 0)` sentinel ("no position yet" or
 * "location hidden by privacy"). Mirrors the predicate at
 * `hooks/space3d/useProximity.ts:229,246,367` and is exported so other
 * consumers (3D rendering, minimap) can reuse the same definition.
 */
export function isPresencePositionSentinel(position: PresencePosition): boolean {
  return position.x === 0 && position.y === 0;
}
