/**
 * @module core/infrastructure/adapters/EcsAvatarLabelDataProvider
 * @description Infrastructure adapter that reads from AvatarECS store
 * and provides label data to the Application layer.
 *
 * Clean Architecture: Infrastructure layer — depends on avatarStore (ECS singleton).
 * Implements the Domain port IAvatarLabelDataProvider.
 *
 * This adapter encapsulates the direct coupling to avatarStore that previously
 * lived inside the AvatarLabels presentation component (PR-10).
 */

import { avatarStore } from '@/lib/ecs/AvatarECS';
import type { AvatarLabelEntity, LabelPresenceStatus } from '../../domain/entities/espacio3d/AvatarLabelEntity';
import type { IAvatarLabelDataProvider } from '../../domain/ports/IAvatarLabelDataProvider';

/** Default avatar height when no measurement is available */
const DEFAULT_AVATAR_HEIGHT = 2.0;

/** Coerce raw status string to LabelPresenceStatus, default 'available' */
function toPresenceStatus(status: string): LabelPresenceStatus {
  if (status === 'available' || status === 'busy' || status === 'away' || status === 'dnd') {
    return status;
  }
  return 'available';
}

/**
 * Reads visible avatars from the ECS store and maps them to AvatarLabelEntity[].
 *
 * Singleton: create once, use per-frame. No internal state — safe to call
 * from useFrame or useMemo without stale closures.
 */
export class EcsAvatarLabelDataProvider implements IAvatarLabelDataProvider {
  getVisibleLabels(
    currentUserId: string,
    avatarHeights: ReadonlyMap<string, number>,
  ): AvatarLabelEntity[] {
    const visible = avatarStore.getAllVisible();
    const labels: AvatarLabelEntity[] = [];

    for (let i = 0; i < visible.length; i++) {
      const entity = visible[i];

      labels.push({
        userId: entity.userId,
        name: entity.name,
        status: toPresenceStatus(entity.status),
        x: entity.currentX,
        z: entity.currentZ,
        avatarHeight: avatarHeights.get(entity.userId) ?? DEFAULT_AVATAR_HEIGHT,
        distanceToCamera: entity.distanceToCamera,
        isCurrentUser: entity.userId === currentUserId,
        isCameraOn: entity.isCameraOn,
        lodLevel: entity.lodLevel,
      });
    }

    return labels;
  }
}

/** Singleton instance — no state, safe to share */
export const ecsAvatarLabelDataProvider = new EcsAvatarLabelDataProvider();
