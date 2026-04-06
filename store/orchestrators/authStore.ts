import type { StateCreator } from 'zustand';
import type { StoreState } from '../state';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

const log = logger.child('auth-store');

type StoreSet = Parameters<StateCreator<StoreState>>[0];

interface SignOutActionOptions {
  storageWorkspaceKey: string;
}

export const createSignOutAction = (
  set: StoreSet,
  options: SignOutActionOptions,
): StoreState['signOut'] => {
  return async () => {
    log.info('Signing out');
    localStorage.removeItem(options.storageWorkspaceKey);
    await supabase.auth.signOut();
    set({
      session: null,
      view: 'dashboard',
      activeWorkspace: null,
      workspaces: [],
      initialized: true,
      isInitializing: false,
    });
  };
};
