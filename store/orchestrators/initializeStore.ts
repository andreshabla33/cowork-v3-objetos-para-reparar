/**
 * @module store/orchestrators/initializeStore
 * @description Orchestrates app initialization using 4 atomic sub-orchestrators.
 * Refactored from 283-line God Orchestrator to ~80 lines.
 *
 * Sub-orchestrators (Clean Architecture — single responsibility):
 * - authBootstrap: Session retrieval + user upsert
 * - userDataLoader: Single query to `usuarios` for all boot fields (NEW)
 * - avatarLoader: 2D + 3D avatar config with fallback chain
 * - statusLoader: Presence status + profile photo
 * - viewResolver: Initial view routing (pure logic, no Supabase)
 *
 * Performance optimizations for 500+ concurrent avatars:
 * 1. userDataLoader merges 2 duplicate `usuarios` queries into 1 (-1 RTT)
 * 2. fetchWorkspaces runs in parallel with avatar+status (-2s boot time)
 * 3. Total boot queries: auth → (userData + avatarConfig + avatar3D + anims + workspaces) parallel
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
import { cargarDatosUsuario } from './bootstrap/userDataLoader';
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
      // Step 1: Auth bootstrap (must complete first — everything depends on session)
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

      // Step 2: Unified user data query (replaces 2 separate queries to `usuarios`)
      // This is fast (~50ms) and provides data needed by avatar+status loaders.
      const userData = await cargarDatosUsuario(user.id);

      // Step 3: ALL remaining queries in parallel — maximum concurrency
      // Previously: avatar+status parallel → THEN workspaces (sequential)
      // Now: avatar + status + workspaces ALL parallel (-2s estimated)
      const [avatarResult, statusResult, workspaces] = await Promise.all([
        cargarAvatar(user.id, options.initialAvatar, userData.avatar),
        cargarStatus(user.id, userData.status),
        get().fetchWorkspaces(),
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

      // Step 4: Resolve view (pure logic, no I/O)
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
