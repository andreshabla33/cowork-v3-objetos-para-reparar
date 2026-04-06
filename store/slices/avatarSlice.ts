/**
 * Avatar Slice — Clean Architecture Domain Store
 *
 * Maneja: configuración de avatar 3D.
 */
import type { StateCreator } from 'zustand';
import type { Avatar3DConfig } from '../../components/avatar3d/shared';

export interface AvatarSlice {
  avatar3DConfig: Avatar3DConfig | null;
  setAvatar3DConfig: (config: Avatar3DConfig | null) => void;
}

export const createAvatarSlice: StateCreator<AvatarSlice, [], [], AvatarSlice> = (set) => ({
  avatar3DConfig: null,
  setAvatar3DConfig: (config) => set({ avatar3DConfig: config }),
});
