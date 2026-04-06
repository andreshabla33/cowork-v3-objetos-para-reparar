/**
 * @module store/orchestrators/initializeStore
 * @description Orchestrates app initialization using 4 atomic sub-orchestrators.
 * Refactored from 283-line God Orchestrator to ~80 lines.
 *
 * Sub-orchestrators (Clean Architecture — single responsibility):
 * - authBootstrap: Session retrieval + user upsert
 * - avatarLoader: 2D + 3D avatar config with fallback chain
 * - statusLoader: Presence status + profile photo
 * - viewResolver: Initial view routing (pure logic, no Supabase)
 *
 * Ref: Zustand 5 — StateCreator with typed set/get for slice composition.
 */

import type { StateCreator } from 'zustand';
import type { AvatarConfig } from '../../types';
import type { StoreState } from '../state';
import { logger } from '../../lib/logger';
import { supabase } from '../../lib/supabase';

// Atomic orchestrators
import { ejecutarAuthBootstrap } from './bootstrap/authBootstrap';
import { cargarAvatar } from './bootstrap/avatarLoader';
import { cargarStatus } from './bootstrap/statusLoader';
import { resolverVista } from './bootstrap/viewResolver';

const log = logger.child('initialize');

type StoreSet = Parameters<StateCreator<StoreState>>[0];
type StoreGet = Parameters<StateCreator<StoreState>>[1];

interface InitializeActionOptions {
  initialAvatar: AvatarConfig;
  storageWorkspaceKey: string;
}

export const createInitializeAction = (
  set: StoreSet,
  get: StoreGet,
  options: InitializeActionOptions,
): StoreState['initialize'] => {
  return async () => {
    // Guard: prevent concurrent or redundant initialization
    if (get().isInitializing) {
      log.debug('Already initializing, skipping');
      return;
    }
    if (get().initialized && get().activeWorkspace) {
      log.debug('Already initialized with active workspace, refreshing session only');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) set({ session });
      } catch { /* ignore */ }
      return;
    }
    if (get().initialized && (get().view === 'onboarding_creador' || get().view === 'onboarding')) {
      log.debug('Already in onboarding flow, skipping re-init');
      return;
    }

    set({
      isInitializing: true,
      ...(get().view === 'reset_password' ? {} : { view: 'loading' as const }),
    });
    log.info('Starting initialization');

    try {
      // Step 1: Auth bootstrap
      const authResult = await ejecutarAuthBootstrap();

      if (authResult.error) {
        set({ session: null, view: 'dashboard', initialized: true, isInitializing: false });
        return;
      }

      if (!authResult.session) {
        if (get().view === 'reset_password') {
          set({ session: null });
        } else {
          set({ session: null, view: 'dashboard' });
        }
        set({ initialized: true, isInitializing: false });
        return;
      }

      const { session } = authResult;
      const { user } = session;
      set({ session });

      // Step 2 & 3: Avatar + Status (parallel for performance)
      const [avatarResult, statusResult] = await Promise.all([
        cargarAvatar(user.id, options.initialAvatar),
        cargarStatus(user.id),
      ]);

      set({
        currentUser: {
          ...get().currentUser,
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
          avatarConfig: avatarResult.avatarConfig,
          profilePhoto: statusResult.profilePhoto,
          status: statusResult.estado_disponibilidad,
          statusText: statusResult.estado_personalizado,
        },
        avatar3DConfig: avatarResult.avatar3DConfig,
      });

      // Step 4: Fetch workspaces + resolve view
      const workspaces = await get().fetchWorkspaces();
      log.info('Workspaces loaded', { count: workspaces.length });

      if (get().view !== 'reset_password') {
        const resolved = resolverVista({
          workspaces,
          storageWorkspaceKey: options.storageWorkspaceKey,
          currentView: get().view,
        });

        if (resolved.workspace) {
          get().setActiveWorkspace(resolved.workspace, resolved.workspace.userRole);
        }
        set({ view: resolved.view });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Initialization failed', { error: msg });
      if (get().view !== 'reset_password') {
        set({ view: 'dashboard' });
      }
    } finally {
      set({ initialized: true, isInitializing: false });
      log.info('Initialization complete');
    }
  };
};
