/**
 * @module modules/workspace/state/useWorkspaceStore
 * @description Bounded-context store for workspaces, active workspace,
 * roles, zones, authorized companies and space-item operations.
 *
 * Includes the `fetchWorkspaces` orchestrator (Supabase remote fetch).
 * Backed by the composed store; type-narrowed view (P0-04 transition).
 */

import type { WorkspaceSlice } from '../../../../store/slices/workspaceSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type WorkspaceStoreState = WorkspaceSlice;

export const useWorkspaceStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  WorkspaceStoreState
>(useComposedStore);
