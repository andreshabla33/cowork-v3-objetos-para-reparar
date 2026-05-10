import type { StateCreator } from 'zustand';
import type { StoreState } from '../storeState';
import type { AvatarConfig, PresenceStatus } from '@/types';
import { avatarCatalogRepository } from '@/src/core/infrastructure/adapters/AvatarCatalogSupabaseRepository';
import { profileRepository } from '@/src/core/infrastructure/adapters/ProfileSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';

type StoreSet = Parameters<StateCreator<StoreState>>[0];
type StoreGet = Parameters<StateCreator<StoreState>>[1];

const log = logger.child('user-store');

export const createUpdateAvatarAction = (
  set: StoreSet,
  get: StoreGet,
): StoreState['updateAvatar'] => {
  return async (config: AvatarConfig) => {
    // Optimistic update
    set((state) => ({ currentUser: { ...state.currentUser, avatarConfig: config } }));

    const { session } = get();
    if (!session?.user?.id) return;

    try {
      await avatarCatalogRepository.guardarConfiguracionAvatar(session.user.id, config);
    } catch (err) {
      log.error('Failed to persist avatar config', {
        userId: session.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
};

export const createUpdateStatusAction = (
  set: StoreSet,
  get: StoreGet,
): StoreState['updateStatus'] => {
  return async (status: PresenceStatus, statusText?: string) => {
    // Optimistic update
    set((state) => ({
      currentUser: {
        ...state.currentUser,
        status,
        statusText: statusText !== undefined ? statusText : state.currentUser.statusText,
      },
    }));

    const { session } = get();
    if (!session?.user?.id) return;

    const ok = await profileRepository.actualizarEstadoDisponibilidad(
      session.user.id,
      status,
      statusText !== undefined ? (statusText || null) : undefined,
    );
    if (!ok) {
      log.error('Failed to persist status', { userId: session.user.id, status });
    }
  };
};
