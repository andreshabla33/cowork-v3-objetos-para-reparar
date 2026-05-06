/**
 * @module modules/space3d/state/useSpace3DStore
 * @description Bounded-context store for the 3D space editor and avatar 3D
 * configuration: edit-mode flags, object selection, copy/paste, dragging,
 * zone drawing, floor-paint type, zone templates and the avatar3DConfig.
 *
 * `setAvatar3DConfig` synchronizes the value into `currentUser` (user store)
 * so presence channels can broadcast it. Backed by the composed store;
 * type-narrowed view (P0-04 transition).
 */

import type { EditorSlice } from '../../../../store/slices/editorSlice';
import type { AvatarSlice } from '../../../../store/slices/avatarSlice';
import { useComposedStore } from '../../_state/composedStore';
import { createStoreView } from '../../_state/createStoreView';

export type Space3DStoreState = EditorSlice & AvatarSlice;

export const useSpace3DStore = createStoreView<
  ReturnType<typeof useComposedStore.getState>,
  Space3DStoreState
>(useComposedStore);
