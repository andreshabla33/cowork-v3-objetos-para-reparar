/**
 * @module hooks/workspace/usePresenceChannels
 * @description Hook for managing Supabase Realtime presence channels with chunk-based interest management.
 * Handles presence synchronization across spatial chunks and user status updates.
 *
 * Architecture: This hook manages Supabase infrastructure (Realtime channels),
 * which is appropriate for infrastructure-level concerns. It still uses proper types
 * and follows error handling patterns.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { obtenerChunk, obtenerChunksVecinos } from '@/lib/chunkSystem';
import { getSettingsSection } from '@/lib/userSettings';
import type { User, Role, PresenceStatus } from '@/types';
import type { PresencePayload } from '@/types/workspace';

const log = logger.child('presence-channels');

interface UsePresenceChannelsProps {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  currentUser: User;
  sessionAccessToken: string | undefined;
  onOnlineUsersChange: (users: User[]) => void;
}

interface UsePresenceChannelsReturn {
  syncPresenceByChunk: () => void;
  updatePresenceInChannels: (nivelDetalle: 'publico' | 'empresa') => Promise<void>;
  cleanup: () => void;
}

/**
 * Presence state from Supabase keyed by user_id
 */
interface PresenceState {
  [userId: string]: PresencePayload[];
}

export function usePresenceChannels({
  activeWorkspaceId,
  userId,
  currentUser,
  sessionAccessToken,
  onOnlineUsersChange,
}: UsePresenceChannelsProps): UsePresenceChannelsReturn {
  const presenceChannelsRef = useRef<Map<string, RealtimeChannel>>(
    new Map()
  );
  const prevOnlineUsersRef = useRef<Set<string>>(new Set());
  const lastNotificationRef = useRef<Map<string, number>>(new Map());
  const userRef = useRef(currentUser);

  userRef.current = currentUser;

  /**
   * Recalculate online users from all subscribed presence channels
   */
  const recalcularUsuarios = useCallback((): void => {
    const usuariosMap = new Map<string, User>();
    const detalleMap = new Map<string, 'empresa' | 'publico'>();

    presenceChannelsRef.current.forEach((channel: RealtimeChannel) => {
      const state = channel.presenceState() as PresenceState;
      Object.keys(state).forEach((key: string) => {
        const presences = state[key] as PresencePayload[];
        presences.forEach((presence: PresencePayload) => {
          if (presence.user_id !== userId) {
            const nivelDetalle: 'empresa' | 'publico' =
              presence.nivel_detalle === 'publico' ? 'publico' : 'empresa';
            const nivelPrevio = detalleMap.get(presence.user_id);
            if (
              nivelPrevio === 'empresa' &&
              nivelDetalle === 'publico'
            ) {
              return;
            }

            detalleMap.set(presence.user_id, nivelDetalle);
            usuariosMap.set(presence.user_id, {
              id: presence.user_id,
              name:
                presence.name ||
                (nivelDetalle === 'publico'
                  ? 'Miembro de otra empresa'
                  : 'Usuario'),
              role: (presence.role || 'miembro') as Role,
              avatar: presence.profilePhoto || '',
              profilePhoto: presence.profilePhoto || '',
              avatarConfig: presence.avatarConfig || {
                skinColor: '#fcd34d',
                clothingColor: '#6366f1',
                hairColor: '#4b2c20',
                accessory: 'none',
              },
              avatar3DConfig: presence.avatar3DConfig || null,
              empresa_id: presence.empresa_id || undefined,
              departamento_id: presence.departamento_id || undefined,
              x: presence.x || 500,
              y: presence.y || 500,
              direction: presence.direction || 'front',
              isOnline: true,
              isMicOn: presence.isMicOn || false,
              isCameraOn: presence.isCameraOn || false,
              isScreenSharing: false,
              isPrivate:
                presence.isPrivate ?? nivelDetalle === 'publico',
              status: (presence.status || 'available') as PresenceStatus,
            });
          }
        });
      });
    });

    const nextIds = new Set(usuariosMap.keys());
    const now = Date.now();
    nextIds.forEach((userIdOnline: string) => {
      if (!prevOnlineUsersRef.current.has(userIdOnline)) {
        const lastTime = lastNotificationRef.current.get(userIdOnline) ?? 0;
        if (now - lastTime > 30000) {
          const userName =
            usuariosMap.get(userIdOnline)?.name || 'Usuario';
          log.info('User connected', {
            userId: userIdOnline,
            userName,
          });
          lastNotificationRef.current.set(userIdOnline, now);
        }
      }
    });

    prevOnlineUsersRef.current = nextIds;
    onOnlineUsersChange(Array.from(usuariosMap.values()));
  }, [userId, onOnlineUsersChange]);

  /**
   * Track presence in a single channel
   */
  const trackPresenceEnCanal = useCallback(
    async (
      channel: RealtimeChannel,
      nivelDetalle: 'publico' | 'empresa'
    ): Promise<void> => {
      if (!userId) {
        return;
      }

      const privacy = getSettingsSection('privacy');
      const usuario = userRef.current;

      const statusPrivado =
        !privacy.showOnlineStatus
          ? ('away' as const)
          : !privacy.showActivityStatus
            ? ('available' as const)
            : usuario.status;

      const payloadBase: Partial<PresencePayload> = {
        user_id: userId,
        empresa_id: usuario.empresa_id ?? null,
        departamento_id: usuario.departamento_id ?? null,
        nivel_detalle: nivelDetalle,
        x: privacy.showLocationInSpace ? usuario.x : 0,
        y: privacy.showLocationInSpace ? usuario.y : 0,
        direction: usuario.direction,
        status: statusPrivado,
      };

      const payloadEmpresa: PresencePayload = {
        ...(payloadBase as PresencePayload),
        name: usuario.name,
        role: usuario.role,
        avatarConfig: usuario.avatarConfig,
        profilePhoto: usuario.profilePhoto || '',
        isMicOn: usuario.isMicOn || false,
        isCameraOn: usuario.isCameraOn || false,
        avatar3DConfig: usuario.avatar3DConfig || null,
      };

      const payloadPublico: PresencePayload = {
        ...(payloadBase as PresencePayload),
        name: 'Miembro de otra empresa',
        role: 'miembro' as Role,
        avatarConfig: undefined,
        profilePhoto: '',
        isMicOn: false,
        isCameraOn: false,
        isPrivate: true,
        status: 'away' as PresenceStatus,
      };

      try {
        await channel.track(
          nivelDetalle === 'empresa' ? payloadEmpresa : payloadPublico
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        log.warn('Error tracking presence', {
          error: message,
          nivelDetalle,
        });
      }
    },
    [userId]
  );

  /**
   * Synchronize presence channels based on user's current chunk and nearby chunks
   */
  const syncPresenceByChunk = useCallback((): void => {
    if (!activeWorkspaceId || !userId) {
      return;
    }

    const usuario = userRef.current;
    const chunkActual = obtenerChunk(usuario.x, usuario.y);
    const claves = obtenerChunksVecinos(chunkActual, 2);
    const canalesDeseados = new Map<
      string,
      'publico' | 'empresa'
    >();
    const empresaId = usuario.empresa_id ?? null;

    claves.forEach((clave: string) => {
      canalesDeseados.set(
        `workspace:${activeWorkspaceId}:${clave}:publico`,
        'publico'
      );
      if (empresaId) {
        canalesDeseados.set(
          `workspace:${activeWorkspaceId}:${clave}:empresa:${empresaId}`,
          'empresa'
        );
      }
    });

    canalesDeseados.forEach(
      (nivelDetalle: 'publico' | 'empresa', canalNombre: string) => {
        if (presenceChannelsRef.current.has(canalNombre)) {
          return;
        }

        const channel = supabase.channel(canalNombre, {
          config: { presence: { key: userId } },
        });

        channel
          .on('presence', { event: 'sync' }, () => {
            recalcularUsuarios();
          })
          .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              await trackPresenceEnCanal(channel, nivelDetalle);
            }
          });

        presenceChannelsRef.current.set(canalNombre, channel);
      }
    );

    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (!canalesDeseados.has(canalNombre)) {
          supabase.removeChannel(channel);
          presenceChannelsRef.current.delete(canalNombre);
        }
      }
    );
  }, [
    activeWorkspaceId,
    userId,
    recalcularUsuarios,
    trackPresenceEnCanal,
  ]);

  /**
   * Update presence in all active channels
   */
  const updatePresenceInChannels = useCallback(
    async (nivelDetalle: 'publico' | 'empresa'): Promise<void> => {
      if (!userId) {
        return;
      }

      presenceChannelsRef.current.forEach(
        (channel: RealtimeChannel, canalNombre: string) => {
          if (channel.state === 'joined') {
            const nivel =
              canalNombre.includes(':publico') ? 'publico' : 'empresa';
            trackPresenceEnCanal(channel, nivel);
          }
        }
      );
    },
    [userId, trackPresenceEnCanal]
  );

  /**
   * Cleanup all presence channels on unmount
   */
  const cleanup = useCallback((): void => {
    presenceChannelsRef.current.forEach((channel: RealtimeChannel) => {
      supabase.removeChannel(channel);
    });
    presenceChannelsRef.current.clear();
    prevOnlineUsersRef.current = new Set();
  }, []);

  return {
    syncPresenceByChunk,
    updatePresenceInChannels,
    cleanup,
  };
}
