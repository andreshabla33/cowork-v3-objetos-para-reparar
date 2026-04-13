/**
 * @module core/application/usecases/PrepararAvatarLabelsUseCase
 * @description Application layer use case that prepares avatar label data
 * for the Presentation layer.
 *
 * Clean Architecture:
 *   - Depends on Domain ports (IAvatarLabelDataProvider) — NOT on avatarStore directly
 *   - Applies business rules: visibility filtering, distance culling, LOD checks
 *   - Returns pure AvatarLabelEntity[] ready for rendering
 *
 * This use case encapsulates the logic that was previously spread across:
 *   - AvatarLabels.tsx (PR-10): distance culling, font size quantization
 *   - Avatar component: allowName logic (camera, LOD, company checks)
 *
 * Unifying this logic here ensures a single source of truth for
 * "should this avatar show a name label?"
 */

import type { AvatarLabelEntity } from '../../domain/entities/espacio3d/AvatarLabelEntity';
import { LABEL_CONFIG } from '../../domain/entities/espacio3d/AvatarLabelEntity';
import type { IAvatarLabelDataProvider } from '../../domain/ports/IAvatarLabelDataProvider';

export interface PrepararAvatarLabelsInput {
  /** ID of the current (local) user */
  currentUserId: string;
  /** Map of userId → measured avatar height from GLTFAvatar onHeightComputed */
  avatarHeights: ReadonlyMap<string, number>;
  /** Whether the global setting to show names is enabled */
  showNames: boolean;
}

export interface PrepararAvatarLabelsOutput {
  /** Filtered, ready-to-render label entities */
  labels: AvatarLabelEntity[];
}

/**
 * Use case: prepare the list of avatar labels to render this frame.
 *
 * Filtering pipeline:
 *   1. Provider.getVisibleLabels() — ECS visibility + basic entity data
 *   2. Global showNames setting check
 *   3. Distance culling (LABEL_CONFIG.CULL_DISTANCE)
 *   4. LOD-based filtering (no labels for 'low' LOD)
 *   5. Camera-on check (hide label when video bubble is showing)
 */
export class PrepararAvatarLabelsUseCase {
  constructor(private readonly provider: IAvatarLabelDataProvider) {}

  execute(input: PrepararAvatarLabelsInput): PrepararAvatarLabelsOutput {
    if (!input.showNames) {
      return { labels: [] };
    }

    const rawLabels = this.provider.getVisibleLabels(
      input.currentUserId,
      input.avatarHeights,
    );

    // Apply domain business rules for label visibility
    const filtered = rawLabels.filter((label) => {
      // Distance culling
      if (label.distanceToCamera > LABEL_CONFIG.CULL_DISTANCE) return false;

      // Don't show labels for low-LOD avatars (too far to read)
      if (label.lodLevel === 'low') return false;

      // Hide label when camera is on and avatar is close enough to see video
      if (label.isCameraOn && (label.lodLevel === 'high' || label.lodLevel === 'mid')) {
        return false;
      }

      return true;
    });

    return { labels: filtered };
  }
}
