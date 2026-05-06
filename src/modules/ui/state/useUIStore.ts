/**
 * @module modules/ui/state/useUIStore
 * @description Bounded-context store for presentation-only UI state:
 * theme, current view, active sub-tab, notifications, mini-mode, onboarding.
 *
 * Backed by the composed store; type-narrowed view (P0-04 transition).
 */

import type { UISlice } from '../../../../store/slices/uiSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type UIStoreState = UISlice;

export const useUIStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  UIStoreState
>(useComposedStore);
