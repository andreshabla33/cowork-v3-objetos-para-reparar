/**
 * @module modules/chat/state/useChatStore
 * @description Bounded-context store for chat messages, unread counter and
 * the active chat group identifier.
 *
 * Reads `currentUser.name` from `useUserStore` and dispatches mention
 * notifications via `useUIStore.addNotification`. Mutations targeting
 * those external slices remain co-located with the underlying chat slice
 * for behavior parity.
 */

import type { ChatSlice } from '../../../../store/slices/chatSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type ChatStoreState = ChatSlice;

export const useChatStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  ChatStoreState
>(useComposedStore);
