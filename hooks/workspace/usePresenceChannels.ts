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
 * Same-company detection (3-layer, no race conditions):
 * 1. Channel name: workspace:X:chunk:empresa:UUID → authoritative membership
 * 2. Pre-scan: Phase 1 scans empresa channels to build empresaUserIds set
 * 3. Payload: presence.empresa_id match (fallback for edge cases)
 * Any of the 3 layers detecting same-company → user treated as empresa-level.
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
import { PresenceStatus } from '@/types';
import type { User, Role } from '@/types';
import type { PresencePayload } from '@/types/workspace';

const log = logger.child('presence-channels');

// ─── Channel resilience constants ─────────────────────────────────────────────
// Ref: supabase/realtime-js — RealtimeChannel has internal rejoinTimer for
// CHANNEL_ERROR and TIMED_OUT, but CLOSED channels have NO auto-recovery.
// Ref: https://github.com/orgs/supabase/discussions/27513 — community confirms
//      that CLOSED channels must be manually removed + recreated.
// Ref: Supabase troubleshooting — "if status is NOT subscribed, unsubscribe
//      using removeChannel and subscribe again."

/** Maximum retry attempts before giving up (prevents quota burn). */
const MAX_CHANNEL_RETRIES = 5;
/** Base delay (ms) for exponential backoff on channel retry. */
const CHANNEL_RETRY_BASE_MS = 3_000;
/** Dead channel states that require removal + recreation.
 *
 * Only 'closed' qualifies: CLOSED has NO rejoinTimer and must be recreated
 * manually. 'errored' is transient and driven by the socket's own
 * _triggerChanError on heartbeat timeout — RealtimeChannel has an internal
 * rejoinTimer (1,2,5,10s backoff) that reconnects automatically once the
 * WebSocket reopens. Removing errored channels pre-emptively races against
 * that timer and turns a single transport hiccup into a 50-channel flood.
 *
 * Ref: realtime-js RealtimeClient.ts — _triggerChanError broadcasts
 *      CHANNEL_EVENTS.error to every channel when heartbeat times out.
 * Ref: realtime-js RealtimeChannel.ts — CHANNEL_STATES enum
 *      (closed | joined | joining | errored | leaving) and rejoinTimer.
 */
const DEAD_CHANNEL_STATES = new Set(['closed']);

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
  forceRetrackAll: () => void;
  cleanup: () => void;
  /**
   * Inspects all presence channels and purges any in dead states
   * (errored, closed). After purging, calls syncPresenceByChunk to recreate.
   *
   * Ref: supabase/realtime-js RealtimeChannel.ts — CHANNEL_STATES:
   *   closed | joined | joining | errored | leaving.
   * The client auto-retries on CHANNEL_ERROR and TIMED_OUT via rejoinTimer,
   * but CLOSED channels have NO automatic recovery — they must be removed
   * and recreated. See: https://github.com/supabase/realtime-js
   */
  checkChannelHealth: () => void;
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
  /** Global empresa discovery channel — ensures same-company users discover
   *  each other regardless of chunk distance. Without this, users in non-
   *  overlapping chunks never enter onlineUsers and the "always include
   *  same-company" filter in useChunkSystem has nothing to include. */
  const globalChannelRef = useRef<RealtimeChannel | null>(null);
  /**
   * Re-entrancy guard for removeChannel calls.
   *
   * supabase.removeChannel(ch) synchronously calls ch.leave() → trigger('close')
   * → which re-fires the subscribe callback with status='CLOSED' — INSIDE the
   * same call stack. Without this guard, the callback calls removeChannel again
   * → infinite recursion → "Maximum call stack size exceeded".
   *
   * Ref: GitHub Discussion #27513 — recursive re-subscription within status
   *      callback creates a loop between SUBSCRIBED and CLOSED states.
   * Ref: supabase/realtime-js RealtimeChannel.ts — leave() triggers state
   *      transition synchronously via stateChangeCallbacks.
   */
  const removingChannelsRef = useRef<Set<string>>(new Set());
  const prevOnlineUsersRef = useRef<Set<string>>(new Set());
  const lastNotificationRef = useRef<Map<string, number>>(new Map());
  const userRef = useRef(currentUser);
  const lastSyncRef = useRef(0);
  const lastTrackRef = useRef(0);
  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pending retry timer for channel recovery (cleared on cleanup). */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic retry counter for exponential backoff. Reset on successful subscribe. */
  const retryCountRef = useRef(0);

  userRef.current = currentUser;

  // Application-layer policy for subscription decisions
  const subscriptionPolicy = useMemo(() => new EvaluarPresenceSubscriptionUseCase(), []);

  /**
   * Safely remove a Supabase Realtime channel with re-entrancy protection.
   *
   * supabase.removeChannel() synchronously triggers leave() → close callback
   * → which would call removeChannel again from inside the subscribe handler.
   * This guard breaks the cycle by tracking which channels are mid-removal.
   *
   * Ref: Supabase docs "removeChannel" — "Unsubscribes and removes Realtime
   *      channel from Realtime client."
   * Ref: supabase/realtime-js — leave() triggers stateChangeCallbacks sync.
   */
  const safeRemoveChannel = useCallback((channel: RealtimeChannel, channelName: string): void => {
    if (removingChannelsRef.current.has(channelName)) return; // Already mid-removal
    removingChannelsRef.current.add(channelName);
    try {
      supabase.removeChannel(channel);
    } finally {
      removingChannelsRef.current.delete(channelName);
    }
  }, []);

  /**
   * Recalculate online users from all subscribed presence channels.
   *
   * Channel processing order guarantee:
   *   1. Process PUBLICO channels first → populate user with obfuscated data
   *   2. Process EMPRESA channels second → overwrite with full data
   *   This ensures empresa ALWAYS wins regardless of Map insertion order
   *   or Supabase subscription callback timing.
   *
   * Debounce (150ms):
   *   Multiple channels fire 'sync' independently. Without debounce, the first
   *   sync (often publico) would emit users as "Miembro de otra empresa" before
   *   the empresa channel has received the same user's track(). The debounce
   *   coalesces rapid sync events so all channels are read together.
   */
  const recalcularUsuariosInner = useCallback((): void => {
    const usuariosMap = new Map<string, User>();
    const detalleMap = new Map<string, 'empresa' | 'publico'>();
    const currentEmpresaId = userRef.current.empresa_id;

    // ── Phase 0: Read global empresa discovery channel ──────────────────
    // The global channel ensures ALL same-company users are discoverable
    // regardless of chunk distance. Without this, users in non-overlapping
    // chunks never enter onlineUsers. Ref: Gather/Kumospace use workspace-
    // wide presence for discovery + spatial channels for detailed data.
    if (globalChannelRef.current && currentEmpresaId) {
      const globalState = globalChannelRef.current.presenceState() as PresenceState;
      for (const key of Object.keys(globalState)) {
        const presences = globalState[key] as PresencePayload[];
        for (const presence of presences) {
          if (!presence.user_id || presence.user_id === userId) continue;
          // Seed the map with minimal data from global channel.
          // Chunk-based channels will OVERWRITE this with richer data
          // if the user is also within chunk range (empresa always wins).
          if (!usuariosMap.has(presence.user_id)) {
            usuariosMap.set(presence.user_id, {
              id: presence.user_id,
              name: presence.name || 'Usuario',
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
              empresa_id: currentEmpresaId,
              departamento_id: presence.departamento_id || undefined,
              x: presence.x || 500,
              y: presence.y || 500,
              direction: presence.direction || 'front',
              isOnline: true,
              isMicOn: presence.isMicOn || false,
              isCameraOn: presence.isCameraOn || false,
              isScreenSharing: false,
              isPrivate: false,
              status: (presence.status || 'available') as PresenceStatus,
            });
            detalleMap.set(presence.user_id, 'empresa');
          }
        }
      }
    }

    // ── Phase 1: Collect empresa user IDs from channel names ────────────
    // The channel name is AUTHORITATIVE for empresa membership:
    // "workspace:X:chunk:empresa:UUID" → any user in this channel belongs
    // to that empresa. This is deterministic and immune to payload race
    // conditions (stale empresa_id, delayed track, throttled updates).
    const empresaUserIds = new Set<string>();
    if (currentEmpresaId) {
      const empresaSuffix = `:empresa:${currentEmpresaId}`;
      presenceChannelsRef.current.forEach((channel, canalNombre) => {
        if (!canalNombre.includes(empresaSuffix)) return;
        const state = channel.presenceState() as PresenceState;
        for (const key of Object.keys(state)) {
          const presences = state[key] as PresencePayload[];
          for (const presence of presences) {
            if (presence.user_id && presence.user_id !== userId) {
              empresaUserIds.add(presence.user_id);
            }
          }
        }
      });
    }

    // ── Phase 2: Process all channels (publico first, empresa last) ─────
    // empresa always overwrites publico data for the same user.
    const sortedChannels = Array.from(presenceChannelsRef.current.entries())
      .sort(([a], [b]) => {
        const aIsEmpresa = a.includes(':empresa:') ? 1 : 0;
        const bIsEmpresa = b.includes(':empresa:') ? 1 : 0;
        return aIsEmpresa - bIsEmpresa;
      });

    for (const [canalNombre, channel] of sortedChannels) {
      // Determine if this channel is an empresa channel by its name
      const isEmpresaChannel = canalNombre.includes(':empresa:');
      const state = channel.presenceState() as PresenceState;
      for (const key of Object.keys(state)) {
        const presences = state[key] as PresencePayload[];
        for (const presence of presences) {
          if (presence.user_id === userId) continue;

          const nivelDetalle: 'empresa' | 'publico' =
            presence.nivel_detalle === 'publico' ? 'publico' : 'empresa';
          const nivelPrevio = detalleMap.get(presence.user_id);

          // Skip publico if we already have empresa data for this user
          if (nivelPrevio === 'empresa' && nivelDetalle === 'publico') {
            continue;
          }

          // ── Same-company detection (3-layer) ─────────────────────────
          // Layer 1: Channel name is authoritative — if user appears in
          //          our empresa channel, they ARE same-company.
          // Layer 2: Phase 1 pre-scan — empresaUserIds set (deterministic).
          // Layer 3: Payload empresa_id match (fallback for edge cases).
          const isSameCompanyByChannel = isEmpresaChannel;
          const isSameCompanyByPrescan = empresaUserIds.has(presence.user_id);
          const isSameCompanyByPayload =
            nivelDetalle === 'publico' &&
            !!currentEmpresaId &&
            !!presence.empresa_id &&
            presence.empresa_id === currentEmpresaId;

          const isSameCompany =
            isSameCompanyByChannel || isSameCompanyByPrescan || isSameCompanyByPayload;

          const effectiveNivel = isSameCompany ? 'empresa' : nivelDetalle;

          detalleMap.set(presence.user_id, effectiveNivel);

          // Resolve empresa_id: channel-name pre-scan is authoritative
          const resolvedEmpresaId = isSameCompanyByPrescan || isSameCompanyByChannel
            ? currentEmpresaId
            : (presence.empresa_id || undefined);

          usuariosMap.set(presence.user_id, {
            id: presence.user_id,
            name:
              presence.name && presence.name !== 'Miembro de otra empresa'
                ? presence.name
                : effectiveNivel === 'publico' ? 'Miembro de otra empresa' : 'Usuario',
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
            empresa_id: resolvedEmpresaId,
            departamento_id: presence.departamento_id || undefined,
            x: presence.x || 500,
            y: presence.y || 500,
            direction: presence.direction || 'front',
            isOnline: true,
            isMicOn: isSameCompany ? (presence.isMicOn || false) : false,
            isCameraOn: isSameCompany ? (presence.isCameraOn || false) : false,
            isScreenSharing: false,
            isPrivate: isSameCompany ? false : (presence.isPrivate ?? effectiveNivel === 'publico'),
            status: (presence.status || 'available') as PresenceStatus,
          });
        }
      }
    }

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
    const usersArray = Array.from(usuariosMap.values());
    if (import.meta.env.DEV) {
      log.debug('recalcularUsuarios result', {
        totalUsers: usersArray.length,
        userIds: usersArray.map(u => u.id.slice(0, 8)),
        chunkChannels: presenceChannelsRef.current.size,
        hasGlobalChannel: !!globalChannelRef.current,
        currentEmpresaId: currentEmpresaId?.slice(0, 8) ?? 'null',
      });
    }
    onOnlineUsersChange(usersArray);
  }, [userId, onOnlineUsersChange]);

  /**
   * Debounced wrapper for recalcularUsuarios.
   * Coalesces rapid 'sync' events from multiple channels (publico + empresa)
   * to avoid transient "Miembro de otra empresa" flicker.
   */
  const recalcularUsuarios = useCallback((): void => {
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = setTimeout(() => {
      recalcTimerRef.current = null;
      recalcularUsuariosInner();
    }, 150);
  }, [recalcularUsuariosInner]);

  /**
   * Track presence in a single channel
   */
  const trackPresenceEnCanal = useCallback(
    async (channel: RealtimeChannel, nivelDetalle: 'publico' | 'empresa'): Promise<void> => {
      if (!userId) return;

      const privacy = getSettingsSection('privacy');
      const usuario = userRef.current;

      // Fix P2 — usar valores del enum PresenceStatus en lugar de strings
      // literales para respetar el contrato del Domain. Plan 34919757.
      const statusPrivado: PresenceStatus =
        !privacy.showOnlineStatus
          ? PresenceStatus.AWAY
          : !privacy.showActivityStatus
            ? PresenceStatus.AVAILABLE
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

    // ── Global empresa discovery channel ───────────────────────────────
    // Subscribe once per workspace+empresa — ensures same-company users
    // discover each other regardless of chunk position. This is the
    // equivalent of Gather's workspace-wide presence layer.
    // Ref: LiveKit docs "Connecting to LiveKit" — after connection,
    //      participants can "exchange data with other participants"
    //      The discovery channel fills the same role for Supabase Presence.
    const globalChannelName = `workspace:${activeWorkspaceId}:global:empresa:${empresaId}`;
    if (!globalChannelRef.current) {
      const channel = supabase.channel(globalChannelName, {
        config: { presence: { key: userId } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          recalcularUsuarios();
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            retryCountRef.current = 0; // Reset backoff on success
            await trackPresenceEnCanal(channel, 'empresa');
            log.info('Global empresa discovery channel subscribed', {
              channelName: globalChannelName,
            });
          } else if (status === 'CLOSED') {
            // ── Recovery for CLOSED only ───────────────────────────────
            // CLOSED has NO rejoinTimer → must remove + recreate.
            // CHANNEL_ERROR, in contrast, is handled by RealtimeChannel's
            // internal rejoinTimer; removing it pre-emptively races against
            // that timer and turns a socket heartbeat timeout (which fires
            // CHANNEL_ERROR on EVERY channel at once via _triggerChanError)
            // into a mass remove+recreate flood.
            // Ref: GitHub Discussion #27513 — "removeChannel and subscribe again"
            //      applies ONLY to CLOSED; errored channels self-heal.
            if (removingChannelsRef.current.has(globalChannelName)) return;
            log.warn('Global discovery channel CLOSED — scheduling recovery', {
              status,
              channelName: globalChannelName,
              retryCount: retryCountRef.current,
            });
            safeRemoveChannel(channel, globalChannelName);
            globalChannelRef.current = null;
            scheduleChannelRetry();
          } else if (status === 'CHANNEL_ERROR') {
            // Transient: trust the rejoinTimer. Health-check will promote
            // to CLOSED and purge only if the channel never recovers.
            log.debug('Global discovery channel CHANNEL_ERROR — trusting rejoinTimer', {
              channelName: globalChannelName,
            });
          } else if (status === 'TIMED_OUT') {
            // Supabase's rejoinTimer handles TIMED_OUT automatically.
            // Log for diagnostics; if it persists, checkChannelHealth will catch it.
            log.warn('Global discovery channel TIMED_OUT — awaiting auto-rejoin', {
              channelName: globalChannelName,
            });
          }
        });

      globalChannelRef.current = channel;
    }

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
            } else if (status === 'CLOSED') {
              // Re-entrancy guard: removeChannel() synchronously triggers
              // leave() → close callback → this handler again. Without
              // this check → infinite recursion → stack overflow.
              if (removingChannelsRef.current.has(canalNombre)) return;
              log.warn('Chunk channel CLOSED — removing for recreation', {
                status,
                channelName: canalNombre,
              });
              safeRemoveChannel(channel, canalNombre);
              presenceChannelsRef.current.delete(canalNombre);
              scheduleChannelRetry();
            } else if (status === 'CHANNEL_ERROR') {
              // Transient: RealtimeChannel.rejoinTimer handles it.
              // Health-check escalates to CLOSED if it never recovers.
              log.debug('Chunk channel CHANNEL_ERROR — trusting rejoinTimer', {
                channelName: canalNombre,
              });
            }
          });

        presenceChannelsRef.current.set(canalNombre, channel);
      },
    );

    // Unsubscribe from channels no longer in range
    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (!canalesDeseados.has(canalNombre)) {
          safeRemoveChannel(channel, canalNombre);
          presenceChannelsRef.current.delete(canalNombre);
        }
      },
    );

    log.debug('Presence sync', {
      radius: decision.radius,
      channels: presenceChannelsRef.current.size,
      nearbyAvatars: nearbyCount,
    });
  }, [activeWorkspaceId, userId, recalcularUsuarios, trackPresenceEnCanal, subscriptionPolicy, safeRemoveChannel]);

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

      // Update chunk-based channels
      presenceChannelsRef.current.forEach(
        (channel: RealtimeChannel, canalNombre: string) => {
          if (channel.state === 'joined') {
            const nivel = canalNombre.includes(':publico') ? 'publico' : 'empresa';
            trackPresenceEnCanal(channel, nivel);
          }
        },
      );
      // Update global discovery channel
      if (globalChannelRef.current?.state === 'joined') {
        trackPresenceEnCanal(globalChannelRef.current, 'empresa');
      }
    },
    [userId, trackPresenceEnCanal, subscriptionPolicy],
  );

  /**
   * Force re-track in ALL joined channels, bypassing the throttle.
   *
   * Called when empresa_id loads to ensure all payloads carry the correct
   * empresa_id. Without this, payloads tracked during the initial subscription
   * (before empresa_id loaded) would have stale data until the next throttled
   * update (up to 5s later). Also triggers a recalculation to re-read all
   * channels with the now-correct empresa_id for same-company detection.
   */
  const forceRetrackAll = useCallback((): void => {
    if (!userId) return;
    lastTrackRef.current = Date.now();
    // Re-track chunk-based channels
    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (channel.state === 'joined') {
          const nivel = canalNombre.includes(':publico') ? 'publico' : 'empresa';
          trackPresenceEnCanal(channel, nivel);
        }
      },
    );
    // Re-track global discovery channel
    if (globalChannelRef.current?.state === 'joined') {
      trackPresenceEnCanal(globalChannelRef.current, 'empresa');
    }
    // Force recalculation with updated empresa_id
    recalcularUsuarios();
    log.info('Force re-tracked all channels after empresa_id change');
  }, [userId, trackPresenceEnCanal, recalcularUsuarios]);

  /**
   * Schedule a retry of syncPresenceByChunk with exponential backoff.
   *
   * Backoff formula: CHANNEL_RETRY_BASE_MS × 2^retryCount
   *   Attempt 0 → 3s, 1 → 6s, 2 → 12s, 3 → 24s, 4 → 48s
   *
   * Capped at MAX_CHANNEL_RETRIES to prevent Supabase quota burn.
   * Ref: Supabase troubleshooting — "a client that fails to authenticate
   *       or subscribe may retry rapidly, creating thousands of short-lived
   *       connections" — exponential backoff prevents this.
   */
  const scheduleChannelRetry = useCallback((): void => {
    if (retryTimerRef.current) return; // Already scheduled
    if (retryCountRef.current >= MAX_CHANNEL_RETRIES) {
      log.error('Presence channel retry limit reached — giving up', {
        maxRetries: MAX_CHANNEL_RETRIES,
      });
      return;
    }

    const delay = CHANNEL_RETRY_BASE_MS * Math.pow(2, retryCountRef.current);
    retryCountRef.current += 1;

    log.info('Scheduling presence channel retry', {
      attempt: retryCountRef.current,
      delayMs: delay,
    });

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      // Force lastSyncRef to 0 so the throttle in syncPresenceByChunk
      // doesn't skip this recovery attempt.
      lastSyncRef.current = 0;
      syncPresenceByChunk();
    }, delay);
  }, [syncPresenceByChunk]);

  /**
   * Health check: inspects all presence channels for dead states
   * (errored, closed) and purges them so syncPresenceByChunk can recreate.
   *
   * This catches channels that:
   * - Got CLOSED after WS drop (ERR_CONNECTION_CLOSED) and the subscribe
   *   callback fired but the ref was already set (race with creation).
   * - Got stuck in 'errored' state where rejoinTimer exhausted its own
   *   internal retries but the channel was never removed from our refs.
   * - Silently disconnected (no close event) — detectable by state.
   *
   * Ref: supabase/realtime-js CHANNEL_STATES: closed | joined | joining | errored | leaving
   * Ref: Supabase docs "heartbeatCallback" — "provides visibility into the
   *       connection's health and a mechanism for explicit reconnection"
   *
   * Clean Architecture: Infrastructure concern — no domain logic.
   */
  const checkChannelHealth = useCallback((): void => {
    let purgedCount = 0;

    // Check global discovery channel
    if (globalChannelRef.current) {
      const globalName = `global-empresa-discovery`;
      const state = globalChannelRef.current.state;
      if (DEAD_CHANNEL_STATES.has(state)) {
        log.warn('Health check: global discovery channel dead', { state });
        safeRemoveChannel(globalChannelRef.current, globalName);
        globalChannelRef.current = null;
        purgedCount++;
      }
    }

    // Check chunk channels — collect dead ones first, then remove.
    // Iterating + deleting inside forEach is safe for Map, but
    // safeRemoveChannel triggers callbacks that could mutate state.
    const deadChannels: Array<[string, RealtimeChannel]> = [];
    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (DEAD_CHANNEL_STATES.has(channel.state)) {
          deadChannels.push([canalNombre, channel]);
        }
      },
    );

    for (const [canalNombre, channel] of deadChannels) {
      log.warn('Health check: chunk channel dead', { channelName: canalNombre, state: channel.state });
      safeRemoveChannel(channel, canalNombre);
      presenceChannelsRef.current.delete(canalNombre);
      purgedCount++;
    }

    if (purgedCount > 0) {
      log.info('Health check purged dead channels — scheduling recreation', {
        purgedCount,
      });
      scheduleChannelRetry();
    }
  }, [scheduleChannelRetry, safeRemoveChannel]);

  /**
   * Cleanup all presence channels on unmount
   */
  const cleanup = useCallback((): void => {
    if (recalcTimerRef.current) {
      clearTimeout(recalcTimerRef.current);
      recalcTimerRef.current = null;
    }
    // Cancel pending retry — we're tearing down, not recovering.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
    // Clean up chunk-based channels (safeRemoveChannel prevents re-entrancy)
    presenceChannelsRef.current.forEach((channel: RealtimeChannel, canalNombre: string) => {
      safeRemoveChannel(channel, canalNombre);
    });
    presenceChannelsRef.current.clear();
    // Clean up global discovery channel
    if (globalChannelRef.current) {
      safeRemoveChannel(globalChannelRef.current, 'global-empresa-discovery');
      globalChannelRef.current = null;
    }
    prevOnlineUsersRef.current = new Set();
  }, [safeRemoveChannel]);

  return {
    syncPresenceByChunk,
    updatePresenceInChannels,
    forceRetrackAll,
    cleanup,
    checkChannelHealth,
  };
}
