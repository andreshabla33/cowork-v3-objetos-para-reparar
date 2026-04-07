/**
 * @module core/domain/ports/IAvatarResourceDisposer
 * @description Domain port for avatar GPU resource disposal callbacks.
 *
 * Clean Architecture: Domain layer — pure interface, no Three.js deps.
 *
 * Problem solved:
 *   Three.js geometry.dispose(), material.dispose(), texture.dispose()
 *   must be called explicitly — JS GC does NOT free GPU buffers.
 *   Without explicit disposal, 500+ avatar join/leave cycles leak
 *   ~13KB/avatar = ~50MB over an 8-hour session.
 *
 * Ref: Three.js official docs — "How to dispose of objects"
 *   "You have to explicitly dispose geometry and material via dispose(),
 *    as these objects are not released automatically."
 */

/**
 * Callback invoked when an avatar entity is removed from the ECS.
 * Infrastructure layer (rendering) registers this to clean up GPU resources.
 *
 * @param userId  The ID of the avatar being removed
 */
export type AvatarDisposeCallback = (userId: string) => void;

/**
 * Registry for avatar resource disposal callbacks.
 * Decouples ECS (data layer) from rendering (infrastructure layer).
 *
 * Flow:
 *   1. InstancedAvatarRenderer registers a callback via onRemove()
 *   2. AvatarStore.remove(userId) fires all registered callbacks
 *   3. Callback disposes geometry/material/texture for that avatar
 *   4. GPU memory freed immediately (not waiting for GC)
 */
export interface IAvatarResourceDisposer {
  /** Register a callback to be invoked when an avatar is removed */
  onRemove(callback: AvatarDisposeCallback): () => void;

  /** Fire all registered callbacks for a specific avatar */
  notifyRemoval(userId: string): void;

  /** Remove all registered callbacks (e.g., on scene unmount) */
  clearAll(): void;
}
