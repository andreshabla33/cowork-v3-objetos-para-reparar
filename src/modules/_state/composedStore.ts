/**
 * @module modules/_state/composedStore
 * @description Composed Zustand store — single source of truth.
 *
 * Internal composition root for the multi-store decomposition (P0-04).
 * Each `src/modules/<feature>/state/use<X>Store.ts` exposes a narrowed,
 * typed view over this same store. The legacy `store/useStore.ts` is a
 * compat shim that re-exports `useComposedStore` as `useStore`.
 *
 * Roadmap: see `docs/ROADMAP-CLEAN-ARCH-FIX-2026.md` "Decisiones tomadas (2026-05-05)".
 *
 * Ref (Zustand v5):
 *   - https://github.com/pmndrs/zustand#slices-pattern
 *   - https://github.com/pmndrs/zustand/discussions/1045
 */

import { create } from 'zustand';
import type { AvatarConfig } from '../../../types';
import type { StoreState } from '../../../store/state';
import { createInitializeAction } from '../../../store/orchestrators/initializeStore';
import { createFetchWorkspacesAction } from '../../../store/orchestrators/workspaceStore';
import { createSignOutAction } from '../../../store/orchestrators/authStore';
import { createUpdateAvatarAction, createUpdateStatusAction } from '../../../store/orchestrators/userStore';
import {
  createAuthSlice,
  createUISlice,
  createWorkspaceSlice,
  createChatSlice,
  createEditorSlice,
  createUsersSlice,
  createAvatarSlice,
} from '../../../store/slices';

const initialAvatar: AvatarConfig = {
  skinColor: '#fcd34d',
  clothingColor: '#6366f1',
  hairColor: '#4b2c20',
  accessory: 'headphones',
};

const STORAGE_WS_KEY = 'cowork_active_workspace_id';

export const useComposedStore = create<StoreState>()((set, get, store) => ({
  ...createAuthSlice(set, get, store),
  ...createUISlice(set, get, store),
  ...createWorkspaceSlice(set, get, store),
  ...createChatSlice(set, get, store),
  ...createEditorSlice(set, get, store),
  ...createUsersSlice(set, get, store),
  ...createAvatarSlice(set, get, store),

  initialize: createInitializeAction(set, get, {
    initialAvatar,
    storageWorkspaceKey: STORAGE_WS_KEY,
  }),

  fetchWorkspaces: createFetchWorkspacesAction(set, get),

  signOut: createSignOutAction(set, { storageWorkspaceKey: STORAGE_WS_KEY }),

  updateAvatar: createUpdateAvatarAction(set, get),
  updateStatus: createUpdateStatusAction(set, get),
}));

export type { StoreState };
