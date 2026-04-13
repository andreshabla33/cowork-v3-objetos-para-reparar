/**
 * @module core/domain/ports/IAvatarLabelDataProvider
 * @description Domain port for providing avatar label data to the Presentation layer.
 *
 * Clean Architecture: Domain layer — pure interface, no dependencies on
 * Three.js, React, ECS store, or any infrastructure.
 *
 * Problem solved:
 *   AvatarLabels (PR-10) read directly from avatarStore.getAllVisible() inside
 *   the component — coupling Infrastructure (ECS data store) to Presentation.
 *   This port inverts the dependency: Presentation depends on the port,
 *   and Infrastructure implements it.
 */

import type { AvatarLabelEntity } from '../entities/espacio3d/AvatarLabelEntity';

/**
 * Provides prepared label data for all avatars that should display a name label.
 *
 * Implementations:
 *   - EcsAvatarLabelDataProvider (Infrastructure): reads from avatarStore + currentUser
 *
 * Consumers:
 *   - UnifiedAvatarLabels (Presentation): renders the labels in WebGL
 */
export interface IAvatarLabelDataProvider {
  /**
   * Compute and return the list of labels to render this frame.
   * Applies visibility filtering, distance culling, and LOD checks.
   *
   * @param currentUserId  ID of the local user (for isCurrentUser flag)
   * @param avatarHeights  Map of userId → measured avatar height (from GLTFAvatar)
   * @returns Array of AvatarLabelEntity, already filtered and ready to render
   */
  getVisibleLabels(
    currentUserId: string,
    avatarHeights: ReadonlyMap<string, number>,
  ): AvatarLabelEntity[];
}
