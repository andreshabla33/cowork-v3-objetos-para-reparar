import type {
  AuthSlice,
  UISlice,
  WorkspaceSlice,
  ChatSlice,
  EditorSlice,
  UsersSlice,
  AvatarSlice,
} from './slices';

/**
 * Root store contract (clean architecture): composed from domain slices.
 * Keep orchestration methods here while useStore monolith migration is in progress.
 *
 * @deprecated Decomposed into bounded-context views under
 *   `src/modules/<feature>/state/use<X>Store.ts` (P0-04). Prefer importing the
 *   specific bounded-context state type instead of this combined union.
 */
export type StoreState =
  & AuthSlice
  & UISlice
  & WorkspaceSlice
  & ChatSlice
  & EditorSlice
  & UsersSlice
  & AvatarSlice
  & {
    initialize: () => Promise<void>;
  };
