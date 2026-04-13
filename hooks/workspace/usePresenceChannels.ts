/**
 * @module hooks/workspace/usePresenceChannels
 * @description Hook for managing Supabase Realtime presence channels with
 * adaptive interest-based subscription management.
 *
 * Performance for 500+ avatars:
 * - Adaptive radius: baseRadius=1 (9 chunks) vs old radius=2 (25 chunks)
 *   → 64% reduction in channel subscriptions (18 vs 50 per user)
 * - Sync throttle: 2s minimum between channel reconciliations
 * - Track throttle: 5s minimum between presence track() updates
 * - Density-aware: reduces radius further when >100 nearby avatars
 *
 * Clean Architecture: Infrastructure hook (Supabase Realtime).
 * Uses Application-layer policy (EvaluarPresenceSubscriptionUseCase)
 * for subscription decisions — no business logic in this file.
 *
 * Ref: Supabase Realtime Pricing — $2.50/1M msgs.
 *      Each channel.track() = 1 sent msg + N received per subscriber.
 *      Pro plan: 500 peak connections, 5M messages/month quota.
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { obtenerChunk } from '@/lib/chunkSystem';
import { getSettingsSection } from '@/lib/userSettings';
import { EvaluarPresenceSubscriptionUseCase } from '@/src/core/application/usecases/EvaluarPresenceSubscriptionUseCase';
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
  const presenceChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const prevOnlineUsersRef = useRef<Set<string>>(new Set());
  const lastNotificationRef = useRef<Map<string, number>>(new Map());
  const userRef = useRef(currentUser);
  const lastSyncRef = useRef(0);
  const lastTrackRef = useRef(0);

  userRef.current = currentUser;

  // Application-layer policy for subscription decisions
  const subscriptionPolicy = useMemo(() => new EvaluarPresenceSubscriptionUseCase(), []);

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
            if (nivelPrevio === 'empresa' && nivelDetalle === 'publico') {
              return;
            }

            detalleMap.set(presence.user_id, nivelDetalle);
            usuariosMap.set(presence.user_id, {
              id: presence.user_id,
              name:
                presence.name ||
                (nivelDetalle === 'publico' ? 'Miembro de otra empresa' : 'Usuario'),
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
              isPrivate: presence.isPrivate ?? nivelDetalle === 'publico',
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
          const userName = usuariosMap.get(userIdOnline)?.name || 'Usuario';
          log.info('User connected', { userId: userIdOnline, userName });
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
    async (channel: RealtimeChannel, nivelDetalle: 'publico' | 'empresa'): Promise<void> => {
      if (!userId) return;

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
        // El avatar3DConfig (modelo, escala, texturas) NO es información privada —
        // es data cosmética necesaria para renderizar el avatar 3D correctamente.
        // Sin este campo, admins que ven usuarios cross-company con esFantasma=false
        // reciben avatarConfig=null → shader error → rectángulo verde.
        avatar3DConfig: usuario.avatar3DConfig || null,
      };

      try {
        await channel.track(
          nivelDetalle === 'empresa' ? payloadEmpresa : payloadPublico,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Error tracking presence', { error: message, nivelDetalle });
      }
    },
    [userId],
  );

  /**
   * Synchronize presence channels based on adaptive subscription policy.
   *
   * Key changes for 500+ avatar scalability:
   * 1. Uses EvaluarPresenceSubscriptionUseCase for radius decisions
   * 2. Throttled to 2s minimum between syncs (was unthrottled)
   * 3. Adaptive radius: base=1 (9 chunks) with density expansion/reduction
   * 4. Channel count: max 18 (9 chunks × 2 types) vs old 50
   */
  const syncPresenceByChunk = useCallback((): void => {
    if (!activeWorkspaceId || !userId) return;

    const usuario = userRef.current;

    // ── Race condition guard ────────────────────────────────────────────────
    // empresa_id loads asynchronously via CargarDatosEmpresaUseCase.
    // If we subscribe to publico channels BEFORE empresa_id arrives, the user
    // tracks with payloadPublico (name: "Miembro de otra empresa") and same-
    // company users appear as cross-company ghosts until the empresa channel
    // syncs — which may never override the publico data due to deduplication
    // order. Deferring subscription until empresa_id is loaded ensures we
    // always subscribe to the empresa channel first.
    // The WorkspaceLayout useEffect has currentUser.empresa_id as dependency,
    // so this callback will re-fire once empresa_id loads.
    if (!usuario.empresa_id) {
      log.debug('Deferring syncPresenceByChunk — empresa_id not yet loaded');
      return;
    }

    const nearbyCount = prevOnlineUsersRef.current.size;

    // Application-layer policy decides radius and throttling
    const decision = subscriptionPolicy.evaluate(
      usuario.x,
      usuario.y,
      nearbyCount,
      lastSyncRef.current,
    );

    if (decision.shouldSkip) return;
    lastSyncRef.current = Date.now();

    const empresaId = usuario.empresa_id;
    const canalesDeseados = new Map<string, 'publico' | 'empresa'>();

    for (const clave of decision.desiredChunks) {
      canalesDeseados.set(
        `workspace:${activeWorkspaceId}:${clave}:publico`,
        'publico',
      );
      canalesDeseados.set(
        `workspace:${activeWorkspaceId}:${clave}:empresa:${empresaId}`,
        'empresa',
      );
    }

    // Subscribe to new channels
    canalesDeseados.forEach(
      (nivelDetalle: 'publico' | 'empresa', canalNombre: string) => {
        if (presenceChannelsRef.current.has(canalNombre)) return;

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
      },
    );

    // Unsubscribe from channels no longer in range
    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (!canalesDeseados.has(canalNombre)) {
          supabase.removeChannel(channel);
          presenceChannelsRef.current.delete(canalNombre);
        }
      },
    );

    log.debug('Presence sync', {
      radius: decision.radius,
      channels: presenceChannelsRef.current.size,
      nearbyAvatars: nearbyCount,
    });
  }, [activeWorkspaceId, userId, recalcularUsuarios, trackPresenceEnCanal, subscriptionPolicy]);

  /**
   * Update presence in all active channels (throttled).
   *
   * Performance: Each track() = 1 outbound message per channel.
   * At 18 channels × 10 updates/min = 180 msgs/min vs old 500/min.
   */
  const updatePresenceInChannels = useCallback(
    async (nivelDetalle: 'publico' | 'empresa'): Promise<void> => {
      if (!userId) return;

      // Throttle track() calls to reduce Supabase message count
      if (!subscriptionPolicy.shouldTrack(lastTrackRef.current)) return;
      lastTrackRef.current = Date.now();

      presenceChannelsRef.current.forEach(
        (channel: RealtimeChannel, canalNombre: string) => {
          if (channel.state === 'joined') {
            const nivel = canalNombre.includes(':publico') ? 'publico' : 'empresa';
            trackPresenceEnCanal(channel, nivel);
          }
        },
      );
    },
    [userId, trackPresenceEnCanal, subscriptionPolicy],
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
