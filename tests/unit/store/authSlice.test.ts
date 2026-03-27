import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PresenceStatus } from '@/types';

import { createAuthSlice, type AuthSlice } from '@/store/slices/authSlice';

function createTestStore(): AuthSlice {
  let state: AuthSlice;

  const set = (partial: Partial<AuthSlice> | ((s: AuthSlice) => Partial<AuthSlice>)) => {
    if (typeof partial === 'function') {
      Object.assign(state, partial(state));
    } else {
      Object.assign(state, partial);
    }
  };
  const get = () => state;
  const store = {} as any;

  state = (createAuthSlice as any)(set, get, store);
  return state;
}

describe('authSlice (pure local state — no Supabase)', () => {
  let store: AuthSlice;

  beforeEach(() => {
    store = createTestStore();
  });

  it('setPosition updates x/y/direction', () => {
    store.setPosition(100, 200, 'left', false, true);
    expect(store.currentUser.x).toBe(100);
    expect(store.currentUser.y).toBe(200);
    expect(store.currentUser.direction).toBe('left');
    expect(store.currentUser.isSitting).toBe(false);
    expect(store.currentUser.isMoving).toBe(true);
  });

  it('setPosition bails out when nothing changed', () => {
    const original = store.currentUser;
    store.setPosition(original.x, original.y, original.direction, original.isSitting, original.isMoving);
    // Should be the exact same reference (no set() call)
    expect(store.currentUser).toBe(original);
  });

  it('toggleMic toggles isMicOn', () => {
    expect(store.currentUser.isMicOn).toBe(false);
    store.toggleMic();
    expect(store.currentUser.isMicOn).toBe(true);
    store.toggleMic();
    expect(store.currentUser.isMicOn).toBe(false);
  });

  it('toggleCamera toggles isCameraOn', () => {
    expect(store.currentUser.isCameraOn).toBe(false);
    store.toggleCamera();
    expect(store.currentUser.isCameraOn).toBe(true);
  });

  it('toggleScreenShare can be toggled or forced', () => {
    store.toggleScreenShare();
    expect(store.currentUser.isScreenSharing).toBe(true);
    store.toggleScreenShare(false);
    expect(store.currentUser.isScreenSharing).toBe(false);
  });

  it('setPrivacy / togglePrivacy', () => {
    store.setPrivacy(true);
    expect(store.currentUser.isPrivate).toBe(true);
    store.togglePrivacy();
    expect(store.currentUser.isPrivate).toBe(false);
  });

  it('syncCurrentUserMediaState merges partial media state', () => {
    store.syncCurrentUserMediaState({ isMicOn: true, isCameraOn: true });
    expect(store.currentUser.isMicOn).toBe(true);
    expect(store.currentUser.isCameraOn).toBe(true);
    expect(store.currentUser.isScreenSharing).toBe(false); // unchanged
  });

  it('updateAvatar updates local state (no remote call)', async () => {
    const config = { skinColor: '#ff0000', clothingColor: '#00ff00', hairColor: '#0000ff', accessory: 'none' as const };
    await store.updateAvatar(config);
    expect(store.currentUser.avatarConfig).toEqual(config);
  });

  it('updateStatus optimistically updates and persists', async () => {
    (store as any).session = { user: { id: 'user-1' } };
    await store.updateStatus('busy' as PresenceStatus, 'In a meeting');
    expect(store.currentUser.status).toBe('busy');
    expect(store.currentUser.statusText).toBe('In a meeting');
  });

  it('setEmpresaId / setDepartamentoId update user', () => {
    store.setEmpresaId('emp-1');
    expect(store.currentUser.empresa_id).toBe('emp-1');
    store.setDepartamentoId('dep-1');
    expect(store.currentUser.departamento_id).toBe('dep-1');
    store.setEmpresaId(null);
    expect(store.currentUser.empresa_id).toBeUndefined();
  });
});
