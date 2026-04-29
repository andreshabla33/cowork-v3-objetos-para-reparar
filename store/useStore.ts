import { create } from 'zustand';
import type { AvatarConfig } from '../types';
import type { StoreState } from './state';
import { createInitializeAction } from './orchestrators/initializeStore';
import { createFetchWorkspacesAction } from './orchestrators/workspaceStore';
import { createSignOutAction } from './orchestrators/authStore';
import { createUpdateAvatarAction, createUpdateStatusAction } from './orchestrators/userStore';
import {
  createAuthSlice,
  createUISlice,
  createWorkspaceSlice,
  createChatSlice,
  createEditorSlice,
  createUsersSlice,
  createAvatarSlice,
} from './slices';

type AppState = StoreState;

const initialAvatar: AvatarConfig = {
  skinColor: '#fcd34d',
  clothingColor: '#2563eb',
  hairColor: '#4b2c20',
  accessory: 'headphones'
};

const STORAGE_WS_KEY = 'cowork_active_workspace_id';

export const useStore = create<AppState>()((set, get, store) => ({
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
