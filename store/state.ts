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
