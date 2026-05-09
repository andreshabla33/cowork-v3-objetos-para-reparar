import { describe, expect, it, beforeEach, vi } from 'vitest';

// Regression coverage for the "remote avatar jumps from wrong position to
// real one" bug (2026-05-08).
//
// The sentinel-preservation fix (commit f763a23) added
// `extractPresencePosition` / `isPresencePositionSentinel` and applied them
// in `usePresenceChannels.recalcularUsuariosInner` so the sentinel survives
// the presence-decode hop. But the rendering bootstrap
// (`lib/ecs/AvatarECS.syncWithOnlineUsers`) was still materializing
// sentinel-coord users into entities with `currentX = currentZ = 0` — the
// avatar rendered at world origin for one or more frames, then
// `movementSystem.setTarget`'s `hasReceivedFirstRealTarget` snap teleported
// it to the real position. The visible jump is the regression.
//
// This file pins the contract that the rendering bootstrap MUST honour:
//   1. A new sentinel-coord user does NOT create an entity (defers until
//      non-sentinel coords arrive).
//   2. An EXISTING entity does NOT have its `targetX/Z` overwritten by a
//      delayed presence sync that arrives in sentinel state after a
//      DataPacket already populated the real target.
//   3. Once non-sentinel coords arrive, the entity IS created at the real
//      coordinates (no leftover sentinel render).
//   4. Position-unrelated metadata (status, name, etc.) updates even when
//      the position is sentinel — privacy/idle changes still propagate.

// AvatarECS imports a port from `@/src/core/domain/ports/IAvatarResourceDisposer`
// which is purely type. No additional mocks needed.

import { avatarStore } from '@/core/infrastructure/r3f/ecs/AvatarECS';

interface MinimalUser {
  id: string;
  name: string;
  x: number;
  y: number;
  direction?: string;
  status: string;
  empresa_id?: string | null;
  esFantasma?: boolean;
  isCameraOn?: boolean;
  avatarConfig?: any;
  avatar3DConfig?: any;
  profilePhoto?: string | null;
}

const BASE_USER: Omit<MinimalUser, 'id' | 'x' | 'y'> = {
  name: 'Andres Maldonado',
  direction: 'south',
  status: 'available',
  empresa_id: 'empresa-1',
  esFantasma: false,
  isCameraOn: false,
  avatarConfig: null,
  avatar3DConfig: null,
  profilePhoto: null,
};

const LOCAL_ID = 'local-user';

describe('AvatarECS.syncWithOnlineUsers — (0,0) sentinel guard', () => {
  beforeEach(() => {
    avatarStore.clear();
  });

  describe('new user with sentinel position', () => {
    it('does NOT create an entity when x===0 && y===0', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 0, y: 0, ...BASE_USER }],
        LOCAL_ID,
      );

      expect(avatarStore.size).toBe(0);
      expect(avatarStore.get('remote-1')).toBeUndefined();
    });

    it('creates the entity on a subsequent sync that carries real coords', () => {
      // First sync — sentinel only. No entity.
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 0, y: 0, ...BASE_USER }],
        LOCAL_ID,
      );
      expect(avatarStore.size).toBe(0);

      // Remote hydrates and re-tracks via Supabase Presence with real
      // coords (the f763a23 force-retrack path). Now the entity is
      // created — directly at the real position, no origin render.
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );

      const entity = avatarStore.get('remote-1');
      expect(entity).toBeDefined();
      // scaleFactor=16 → world coords / 16
      expect(entity!.currentX).toBe(20);
      expect(entity!.currentZ).toBe(5);
      expect(entity!.targetX).toBe(20);
      expect(entity!.targetZ).toBe(5);
    });

    it('creates a sentinel-free user normally without affecting the guard', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-real', x: 160, y: 32, ...BASE_USER }],
        LOCAL_ID,
      );

      const entity = avatarStore.get('remote-real');
      expect(entity).toBeDefined();
      expect(entity!.currentX).toBe(10);
      expect(entity!.currentZ).toBe(2);
    });
  });

  describe('existing entity — sentinel must NOT overwrite real target', () => {
    it('preserves targetX/Z when a delayed presence sync arrives at sentinel', () => {
      // T0: presence emits real coords → entity created at the real spot.
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );
      const beforeTargetX = avatarStore.get('remote-1')!.targetX;
      const beforeTargetZ = avatarStore.get('remote-1')!.targetZ;
      expect(beforeTargetX).toBe(20);
      expect(beforeTargetZ).toBe(5);

      // T1: a stale presence sync arrives (e.g. global discovery channel
      // re-tracks before the chunk channel updates). Without this fix the
      // entity would snap targetX/Z back to (0,0) and the next animation
      // frame would lerp the avatar back to world origin.
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 0, y: 0, ...BASE_USER, status: 'busy' }],
        LOCAL_ID,
      );

      const after = avatarStore.get('remote-1')!;
      expect(after.targetX).toBe(beforeTargetX);
      expect(after.targetZ).toBe(beforeTargetZ);
    });

    it('still propagates non-position metadata (status, name) even when sentinel', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );

      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 0, y: 0, ...BASE_USER, status: 'busy', name: 'Renamed' }],
        LOCAL_ID,
      );

      const entity = avatarStore.get('remote-1')!;
      expect(entity.status).toBe('busy');
      expect(entity.name).toBe('Renamed');
    });

    it('does update targetX/Z when the next sync carries fresh real coords', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );

      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 480, y: 160, ...BASE_USER }],
        LOCAL_ID,
      );

      const entity = avatarStore.get('remote-1')!;
      // targetX/Z move to the new real position.
      expect(entity.targetX).toBe(30);
      expect(entity.targetZ).toBe(10);
      // currentX/Z stays at the previous spawn — movementSystem.update
      // (or the `hasReceivedFirstRealTarget` snap) drives the visual lerp.
      expect(entity.currentX).toBe(20);
      expect(entity.currentZ).toBe(5);
    });
  });

  describe('does not regress existing behaviours', () => {
    it('removes entities that disappear from onlineUsers', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );
      expect(avatarStore.size).toBe(1);

      avatarStore.syncWithOnlineUsers([], LOCAL_ID);
      expect(avatarStore.size).toBe(0);
    });

    it('skips the local user (currentUserId) entirely', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: LOCAL_ID, x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
      );
      expect(avatarStore.size).toBe(0);
    });

    it('uses the provided scaleFactor', () => {
      avatarStore.syncWithOnlineUsers(
        [{ id: 'remote-1', x: 320, y: 80, ...BASE_USER }],
        LOCAL_ID,
        32, // alternate scale
      );
      const entity = avatarStore.get('remote-1')!;
      expect(entity.currentX).toBe(10);
      expect(entity.currentZ).toBe(2.5);
    });
  });
});
