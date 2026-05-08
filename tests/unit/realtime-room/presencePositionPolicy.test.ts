import { describe, expect, it } from 'vitest';
import {
  extractPresencePosition,
  isPresencePositionSentinel,
} from '../../../src/modules/realtime-room/domain/PresencePositionPolicy';

// Regression coverage for the 2026-05-08 wrong-position bug:
//
// The presence consumer in `hooks/workspace/usePresenceChannels.ts` used to
// fabricate `(500, 500)` from absent / sentinel coordinates via JS `||`:
//
//     x: presence.x || 500,   // 0 || 500 === 500  ← WRONG
//     y: presence.y || 500,
//
// That collapsed the canonical `(0, 0)` sentinel — meaning "no position yet"
// or "privacy hides location" — into the 500-unit world default. Once the
// remote user appeared at `(500, 500)` in `onlineUsers`, the proximity
// filter at `hooks/space3d/useProximity.ts:229,246,367` (which only fires on
// `(0, 0)`) couldn't reject them, and they were ranked as "in proximity"
// of any local player whose position happened to be near `(500, 500)`. In
// the field this rendered remote avatars at the wrong position whenever
// the LiveKit DataPacket layer fell out of the ECS freshness window.
//
// The fix centralizes the mapping in this Domain helper. These tests pin
// the contract: never fabricate, never collapse 0, never accept garbage.

describe('extractPresencePosition — (0, 0) sentinel preservation', () => {
  it('preserves (0, 0) from a sentinel payload (THIS is the bug fix)', () => {
    // Pre-fix: would have returned (500, 500) due to `presence.x || 500`.
    expect(extractPresencePosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('preserves x = 0 when y is a real number', () => {
    // The user is on the world Y axis. `0 || 500` would have rewritten x.
    expect(extractPresencePosition({ x: 0, y: -334.12 })).toEqual({
      x: 0,
      y: -334.12,
    });
  });

  it('preserves y = 0 when x is a real number', () => {
    expect(extractPresencePosition({ x: -272.56, y: 0 })).toEqual({
      x: -272.56,
      y: 0,
    });
  });

  it('preserves negative coordinates (large regions live in negative quadrant)', () => {
    // Matches the actual hydrated coords from the 2026-05-08 incident logs:
    //   User A at (-272.56, -334.12), User B at (-287.59, -66.39).
    expect(extractPresencePosition({ x: -272.56, y: -334.12 })).toEqual({
      x: -272.56,
      y: -334.12,
    });
  });

  it('preserves positive coordinates verbatim', () => {
    expect(extractPresencePosition({ x: 142.4, y: 873.9 })).toEqual({
      x: 142.4,
      y: 873.9,
    });
  });

  it('falls through to (0, 0) on absent payload fields', () => {
    // Producer omits x/y entirely (e.g. partial payload from older client).
    // Falling through to the sentinel is correct: consumer filter rejects it.
    expect(extractPresencePosition({})).toEqual({ x: 0, y: 0 });
  });

  it('falls through to (0, 0) on null fields', () => {
    expect(extractPresencePosition({ x: null, y: null })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('falls through to (0, 0) on non-finite values (NaN / Infinity)', () => {
    // Defense in depth: a corrupted payload with NaN must not poison the
    // distance math downstream. NaN → sentinel → consumer filter rejects.
    expect(extractPresencePosition({ x: Number.NaN, y: 5 })).toEqual({
      x: 0,
      y: 5,
    });
    expect(
      extractPresencePosition({ x: 5, y: Number.POSITIVE_INFINITY }),
    ).toEqual({ x: 5, y: 0 });
    expect(
      extractPresencePosition({
        x: Number.NEGATIVE_INFINITY,
        y: Number.NaN,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('does NOT use logical-OR semantics — 0 stays 0, never the default', () => {
    // Property-style assertion that explicitly forbids the regression: if
    // anyone re-introduces `payload.x || N`, this test fails for any N.
    const result = extractPresencePosition({ x: 0, y: 0 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.x).not.toBe(500);
    expect(result.y).not.toBe(500);
  });
});

describe('isPresencePositionSentinel — sentinel detection contract', () => {
  it('returns true exactly for (0, 0)', () => {
    expect(isPresencePositionSentinel({ x: 0, y: 0 })).toBe(true);
  });

  it('returns false when only x is 0', () => {
    // A user broadcasting from the world Y axis is NOT the sentinel —
    // they have a real position and must remain visible to proximity.
    expect(isPresencePositionSentinel({ x: 0, y: 5 })).toBe(false);
  });

  it('returns false when only y is 0', () => {
    expect(isPresencePositionSentinel({ x: 5, y: 0 })).toBe(false);
  });

  it('returns false for any non-zero position', () => {
    expect(isPresencePositionSentinel({ x: -272.56, y: -334.12 })).toBe(false);
    expect(isPresencePositionSentinel({ x: 500, y: 500 })).toBe(false);
  });
});

describe('end-to-end regression — incident 2026-05-08', () => {
  // Reconstructs the exact scenario from `logs/logs.md`:
  //   - User A subscribes with currentUser.x=0/y=0 (auth-slice default
  //     sentinel from the 2026-05-08 fix at authSlice.ts:55-56).
  //   - The 45 s `trackThrottleMs` blocks the post-hydration re-track,
  //     so A's tracked Presence stays at (0, 0) for up to 45 s.
  //   - User B reads A from the global empresa discovery channel via
  //     `recalcularUsuariosInner` Phase 0.
  //   - PRE-FIX: B gets A at (500, 500) and ranks A as "near" any local
  //     position close to (500, 500).
  //   - POST-FIX: B gets A at (0, 0); useProximity filters A out until
  //     ECS data from a LiveKit DataPacket arrives.
  it("does not fabricate (500, 500) from A's stale sentinel presence", () => {
    const stalePresenceFromUserA = {
      user_id: '3102f8e8-c0b7-434a-980c-c46c3048d175',
      x: 0,
      y: 0,
    };
    const position = extractPresencePosition(stalePresenceFromUserA);
    expect(position).toEqual({ x: 0, y: 0 });
    expect(isPresencePositionSentinel(position)).toBe(true);
  });

  it("preserves A's real coords once the post-hydration force-retrack lands", () => {
    // After the 2026-05-08 lifecycle fix, the first sentinel→real
    // transition triggers `forceRetrackAll` which bypasses the 45 s
    // throttle and pushes the real coords to all channels.
    const freshPresenceFromUserA = {
      user_id: '3102f8e8-c0b7-434a-980c-c46c3048d175',
      x: -272.56,
      y: -334.12,
    };
    const position = extractPresencePosition(freshPresenceFromUserA);
    expect(position).toEqual({ x: -272.56, y: -334.12 });
    expect(isPresencePositionSentinel(position)).toBe(false);
  });
});
