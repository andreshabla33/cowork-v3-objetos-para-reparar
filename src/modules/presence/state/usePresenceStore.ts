/**
 * @module modules/presence/state/usePresenceStore
 * @description Bounded-context store for participant presence: online users,
 * authoritative LiveKit participant ids, audio-proximity ids and the team's
 * task list (kept here because it mirrors per-user team data alongside
 * presence).
 *
 * Backed by the composed store; type-narrowed view (P0-04 transition).
 */

import type { UsersSlice } from '../../../../store/slices/usersSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type PresenceStoreState = UsersSlice;

export const usePresenceStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  PresenceStoreState
>(useComposedStore);
