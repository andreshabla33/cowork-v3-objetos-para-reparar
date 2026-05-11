/**
 * @module customizer/shared/customizerConstants
 * @description Domain constants for the avatar/object customizer.
 * Extracted from monolithic AvatarCustomizer3D to maintain Clean Architecture:
 * presentation-agnostic mappings belong in a shared module, not in components.
 *
 * Ref: R3F docs — "Build scenes declaratively with reusable, self-contained components"
 */

export const CATEGORY_LABELS: Record<string, string> = {
  todos: 'Todos',
  mobiliario: 'Mobiliario',
  construccion: 'Construcción',
  accesorios: 'Accesorios',
  plantas: 'Plantas',
  tech: 'Tech',
  tecnologia: 'Tech',
  pared: 'Paredes',
  otro: 'Otros',
};

export const CATEGORY_ICONS: Record<string, string> = {
  todos: '🌐',
  mobiliario: '🛋️',
  construccion: '🏗️',
  accesorios: '✨',
  plantas: '🌿',
  tech: '💻',
  tecnologia: '💻',
  pared: '🧱',
  otro: '📦',
};

/**
 * Reorders avatars so the equipped one appears first.
 * Domain logic — pure function, no side effects.
 */
export const reorderAvatars = <T extends { id: string }>(
  avatars: T[],
  equippedAvatarId: string | null,
): T[] => {
  if (!equippedAvatarId) return avatars;
  const equipped = avatars.find((avatar) => avatar.id === equippedAvatarId);
  if (!equipped) return avatars;
  return [equipped, ...avatars.filter((avatar) => avatar.id !== equippedAvatarId)];
};
