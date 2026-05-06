/**
 * @module modules/user/state/useUserStore
 * @description Bounded-context store for user identity, session, presence ops
 * and app-level orchestration (`initialize`, `signOut`).
 *
 * Root store of the multi-store decomposition: other feature stores read from
 * here but should not mutate user state directly.
 *
 * Backed by the composed store (see `_state/composedStore.ts`); this is a
 * type-narrowed view exposed under a feature-scoped name.
 */

import type { AuthSlice } from '../../../../store/slices/authSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type UserStoreState = AuthSlice & {
  initialized: boolean;
  isInitializing: boolean;
  initialize: () => Promise<void>;
};

export const useUserStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  UserStoreState
>(useComposedStore);
