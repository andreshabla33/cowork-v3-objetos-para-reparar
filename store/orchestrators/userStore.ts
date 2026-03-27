import type { StateCreator } from 'zustand';
import type { StoreState } from '../state';
import type { AvatarConfig, PresenceStatus } from '../../types';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

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

    const { error } = await supabase.from('avatar_configuracion').upsert(
      {
        usuario_id: session.user.id,
        configuracion: config,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );

    if (error) {
      log.error('Failed to persist avatar config', { userId: session.user.id, error: error.message });
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

    const { error } = await supabase
      .from('usuarios')
      .update({
        estado_disponibilidad: status,
        estado_personalizado: statusText || null,
        estado_actualizado_en: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (error) {
      log.error('Failed to persist status', { userId: session.user.id, status, error: error.message });
    }
  };
};
