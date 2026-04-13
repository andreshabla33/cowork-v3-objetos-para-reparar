/**
 * Avatar Slice — Clean Architecture Domain Store
 *
 * Maneja: configuración de avatar 3D.
 *
 * IMPORTANT: setAvatar3DConfig also syncs avatar3DConfig into currentUser
 * so that usePresenceChannels includes it in presence payloads.
 * Without this sync, remote users receive avatar3DConfig=null.
 */
import type { StateCreator } from 'zustand';
import type { Avatar3DConfig } from '../../components/avatar3d/shared';
import type { User } from '../../types';

export interface AvatarSlice {
  avatar3DConfig: Avatar3DConfig | null;
  setAvatar3DConfig: (config: Avatar3DConfig | null) => void;
}

export const createAvatarSlice: StateCreator<AvatarSlice, [], [], AvatarSlice> = (set) => ({
  avatar3DConfig: null,
  setAvatar3DConfig: (config) => {
    // Use any to access cross-slice currentUser (composed store)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set((state: any) => {
      const currentUser = state.currentUser as User | undefined;
      const update: Partial<AvatarSlice> & { currentUser?: User } = {
        avatar3DConfig: config,
      };
      // Sync into currentUser for presence payload propagation
      if (currentUser) {
        update.currentUser = { ...currentUser, avatar3DConfig: config };
      }
      return update;
    });
  },
});
