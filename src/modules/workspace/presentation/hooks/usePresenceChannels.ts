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
import { presenceChannelService } from '@/core/infrastructure/adapters/PresenceChannelSupabaseService';
import { logger } from '@/core/infrastructure/observability/logger';
import { obtenerChunk } from '@/core/infrastructure/r3f/chunkSystem';
import { getSettingsSection } from '@/core/infrastructure/userSettings/userSettings';
import { EvaluarPresenceSubscriptionUseCase } from '@/src/core/application/usecases/EvaluarPresenceSubscriptionUseCase';
import { extractPresencePosition } from '@/modules/realtime-room';
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

/**
 * FIX 2026-05-12: persistent errored channel purge threshold.
 *
 * Problema observado en logs producción: el global discovery channel queda
 * en `errored` loop infinito (TIMED_OUT cada ~12s) cuando el subscribe
 * inicial nunca llega a SUBSCRIBED. El rejoinTimer interno reintenta para
 * siempre pero nunca promueve a 'closed' → health-check (que solo purga
 * 'closed') no lo detecta nunca → log spam + funcionalidad degradada.
 *
 * rejoinTimer schedule oficial realtime-js: [1, 2, 5, 10] segundos (4 intentos
 * = ~18s para agotarse). 20s = 4 intentos + buffer → si tras 20s sigue en
 * errored, el rejoinTimer no va a recuperar solo. Purgar y recrear.
 *
 * Ref: realtime-js RealtimeChannel.rejoinTimer config
 * Ref: https://github.com/orgs/supabase/discussions/27513
 */
const ERRORED_CHANNEL_PURGE_THRESHOLD_MS = 20_000;

/**
 * FIX 2026-05-12 ghost user mitigation — stale-presence threshold.
 *
 * Supabase Presence depende de heartbeat (25s) + timeout server-side (~30-60s)
 * para fire LEAVE cuando un cliente desconecta sin untrack. Si user A se mueve
 * antes del timeout y re-suscribe chunks donde user B (fantasma) tenía presence
 * cached, el aggregator re-incluye al fantasma con su última posición.
 *
 * Mitigación client-side: cada track agrega `last_seen: Date.now()` al payload,
 * y el lifecycle refresca via updatePresenceInChannels (45s throttle) aunque
 * user no se mueva. El aggregator filtra presences cuyo last_seen > STALE_MS.
 *
 * Threshold 60s = 1× refresh + margin. Cubre el caso edge donde server LEAVE
 * tarda > 60s (raro pero observado). En condiciones normales, el server LEAVE
 * llega antes (~30-60s) y este filter no se activa.
 *
 * Iteración 1 (5s/15s) saturaba canales: cada track() genera nuevo presence_ref
 * server-side → fire LEAVE del ref previo. 11-16 channels × tracks/5s = cascade
 * de events + CLOSED states. Ref: realtime-js RealtimePresence.ts ~L290.
 *
 * Ref: https://supabase.com/docs/guides/realtime/presence
 */
const STALE_PRESENCE_MS = 60_000;

interface UsePresenceChannelsProps {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  currentUser: User;
  sessionAccessToken: string | undefined;
  onOnlineUsersChange: (users: User[]) => void;
}

interface UsePresenceChannelsReturn {
  /**
   * Sync chunk subscriptions. Pass `{ force: true }` to bypass the
   * `syncThrottleMs` (2 s) check — required when local position transitions
   * from the (0,0) sentinel to a real value within the throttle window, so
   * the chunk subscriptions actually re-target the new position instead of
   * staying frozen on the default-position chunks.
   */
  syncPresenceByChunk: (options?: { force?: boolean }) => void;
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
  /**
   * Fires `channel.untrack()` on every active presence channel (fire-and-forget).
   *
   * Used from page-exit handlers (`pagehide` / `beforeunload`) to broadcast an
   * immediate LEAVE to other subscribers before the WebSocket is torn down.
   * Without this, the avatar of a user who closed their tab stays rendered for
   * everyone else until Supabase's presence heartbeat times out (~30s).
   *
   * Ref: Supabase Realtime Presence — "untrack(): Remove the user's presence
   *      from the channel." Calling untrack before unload is the documented
   *      pattern for deterministic leaves.
   */
  untrackAll: () => void;
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
  /**
   * Timestamp del primer CHANNEL_ERROR/TIMED_OUT por canal. Usado por
   * `checkChannelHealth` para detectar channels atascados en errored loop
   * (rejoinTimer interno falla repetidamente sin promover a 'closed').
   * Se limpia cuando el canal alcanza SUBSCRIBED.
   * FIX 2026-05-12 — ver `ERRORED_CHANNEL_PURGE_THRESHOLD_MS`.
   */
  const firstErroredAtRef = useRef<Map<string, number>>(new Map());
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
      presenceChannelService.eliminarCanal(channel);
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

    // FIX 2026-05-12 ghost user: filtrar presences cuyo last_seen excede
    // STALE_PRESENCE_MS. Si el peer no refrescó su track en >15s, se considera
    // ghost (cerró tab pero el server aún no fire LEAVE por heartbeat timeout).
    // Compat: presences SIN last_seen (legacy clients) NO se filtran.
    const ahora = Date.now();
    const esPresenceVigente = (p: PresencePayload): boolean => {
      if (p.last_seen === undefined) return true;
      return ahora - p.last_seen <= STALE_PRESENCE_MS;
    };

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
          if (!esPresenceVigente(presence)) continue; // ghost filter
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
              // FIX 2026-05-08: el helper preserva el sentinel (0,0) y
              // descarta valores no-finitos. Reemplaza `presence.x || 500`
              // que colapsaba el sentinel a una posición fantasma — ver
              // `src/modules/realtime-room/domain/PresencePositionPolicy.ts`.
              ...extractPresencePosition(presence),
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
            if (!esPresenceVigente(presence)) continue; // ghost filter
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
          if (!esPresenceVigente(presence)) continue; // ghost filter

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
            // FIX 2026-05-08: ver Phase 0 — preserva el sentinel (0,0).
            ...extractPresencePosition(presence),
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

    // Detect disconnections
    const disconnectedUsers: string[] = [];
    prevOnlineUsersRef.current.forEach((userIdPrev) => {
      if (!nextIds.has(userIdPrev)) {
        disconnectedUsers.push(userIdPrev);
        log.info('User disconnected (removed from presence)', { userId: userIdPrev });
      }
    });
    if (disconnectedUsers.length > 0) {
      log.warn('recalcularUsuariosInner: Users disconnected', { count: disconnectedUsers.length, userIds: disconnectedUsers });
    }

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

      // FIX 2026-05-12 ghost user: last_seen incluido en cada track para que
      // consumers puedan filtrar presences stale sin esperar LEAVE del server
      // (~30-60s heartbeat timeout). Refrescado por re-track periódico cada 10s.
      const payloadBase: Partial<PresencePayload> = {
        user_id: userId,
        empresa_id: usuario.empresa_id ?? null,
        departamento_id: usuario.departamento_id ?? null,
        nivel_detalle: nivelDetalle,
        x: privacy.showLocationInSpace ? usuario.x : 0,
        y: privacy.showLocationInSpace ? usuario.y : 0,
        direction: usuario.direction,
        status: statusPrivado,
        last_seen: Date.now(),
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
  const syncPresenceByChunk = useCallback((options: { force?: boolean } = {}): void => {
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
      // FIX 2026-05-08: cuando se solicita `force`, hacemos como si el último
      // sync hubiera ocurrido hace un siglo para que la policy no devuelva
      // shouldSkip. Mantiene la decisión de radio adaptativo sin filtrar.
      options.force ? 0 : lastSyncRef.current,
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
      // Guard: remove any stale channel with same name from Supabase's internal
      // list (can happen after React StrictMode double-mount or HMR). Without
      // this, supabase.channel() may return an already-subscribed instance and
      // calling .on() after .subscribe() throws the "cannot add callbacks" error.
      const existingGlobal = presenceChannelService.buscarCanalActivoPorNombre(globalChannelName);
      if (existingGlobal) {
        presenceChannelService.eliminarCanal(existingGlobal);
      }

      const channel = presenceChannelService.crearCanalPresence(globalChannelName, {
        presence: { key: userId },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          log.debug('Global channel presence:sync event', { channelName: globalChannelName });
          recalcularUsuarios();
        })
        .on('presence', { event: 'join' }, (payload) => {
          const keys = Object.keys(payload.newPresences || {});
          log.debug('Global channel presence:join event', { channelName: globalChannelName, keys });
          recalcularUsuarios();
        })
        .on('presence', { event: 'leave' }, (payload) => {
          const keys = Object.keys(payload.leftPresences || {});
          log.info('Global channel presence:leave event', { channelName: globalChannelName, keys });
          recalcularUsuarios();
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            retryCountRef.current = 0; // Reset backoff on success
            firstErroredAtRef.current.delete(globalChannelName);
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
            firstErroredAtRef.current.delete(globalChannelName);
            scheduleChannelRetry();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Transient: trust the rejoinTimer. checkChannelHealth promueve
            // a purge si el canal queda atascado >ERRORED_CHANNEL_PURGE_THRESHOLD_MS.
            if (!firstErroredAtRef.current.has(globalChannelName)) {
              firstErroredAtRef.current.set(globalChannelName, Date.now());
            }
            if (status === 'TIMED_OUT') {
              log.warn('Global discovery channel TIMED_OUT — awaiting auto-rejoin', {
                channelName: globalChannelName,
              });
            } else {
              log.debug('Global discovery channel CHANNEL_ERROR — trusting rejoinTimer', {
                channelName: globalChannelName,
              });
            }
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

        // Guard: purge stale channel from Supabase's internal registry
        const existingCh = presenceChannelService.buscarCanalActivoPorNombre(canalNombre);
        if (existingCh) {
          presenceChannelService.eliminarCanal(existingCh);
        }

        const channel = presenceChannelService.crearCanalPresence(canalNombre, {
          presence: { key: userId },
        });

        channel
          .on('presence', { event: 'sync' }, () => {
            log.debug('Chunk channel presence:sync event', { channelName: canalNombre });
            recalcularUsuarios();
          })
          .on('presence', { event: 'join' }, (payload) => {
            const keys = Object.keys(payload.newPresences || {});
            log.debug('Chunk channel presence:join event', { channelName: canalNombre, keys });
            recalcularUsuarios();
          })
          .on('presence', { event: 'leave' }, (payload) => {
            const keys = Object.keys(payload.leftPresences || {});
            log.info('Chunk channel presence:leave event', { channelName: canalNombre, keys });
            recalcularUsuarios();
          })
          .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              firstErroredAtRef.current.delete(canalNombre);
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
              firstErroredAtRef.current.delete(canalNombre);
              scheduleChannelRetry();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              // Transient: RealtimeChannel.rejoinTimer handles it.
              // checkChannelHealth promueve a purge si queda atascado
              // >ERRORED_CHANNEL_PURGE_THRESHOLD_MS.
              if (!firstErroredAtRef.current.has(canalNombre)) {
                firstErroredAtRef.current.set(canalNombre, Date.now());
              }
              log.debug('Chunk channel transient error — trusting rejoinTimer', {
                status,
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
   * Casos de uso:
   *  1. empresa_id loads: garantiza payloads con empresa_id correcta sin esperar
   *     al próximo update throttled.
   *  2. Keep-alive periódico (usePresenceLifecycle, 45s) para refrescar
   *     `last_seen` y evitar que peers nos marquen como ghost (umbral 60s).
   *
   * NOTE: cada track() genera nuevo presence_ref server-side → fire LEAVE del
   * ref previo en cada channel. Por eso el interval es 45s (no más frecuente);
   * con N=15 channels eso es ~0.3 tracks/seg. Iter previo con 5s saturó canales.
   * Ref: realtime-js RealtimePresence.ts ~L290 (filter presenceRefsToRemove).
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
    const now = Date.now();

    /**
     * Decide si un canal debe purgarse:
     *   - `closed`: siempre purgar (no tiene rejoinTimer)
     *   - `errored`: purgar si lleva > ERRORED_CHANNEL_PURGE_THRESHOLD_MS atascado
     *     (el rejoinTimer interno agotó su backoff de 1+2+5+10s = 18s)
     * FIX 2026-05-12: el global discovery channel quedaba en errored loop
     * infinito (TIMED_OUT cada ~12s sin recuperar). Sin esta lógica, el
     * health-check solo purgaba `closed` → nunca se recuperaba.
     */
    const debePurgarse = (canalNombre: string, state: string): boolean => {
      if (DEAD_CHANNEL_STATES.has(state)) return true;
      if (state === 'errored') {
        const firstErroredAt = firstErroredAtRef.current.get(canalNombre);
        if (firstErroredAt && now - firstErroredAt > ERRORED_CHANNEL_PURGE_THRESHOLD_MS) {
          return true;
        }
      }
      return false;
    };

    // Check global discovery channel
    if (globalChannelRef.current) {
      // Usar el channel name canónico del Map (NOT 'global-empresa-discovery'
      // hardcoded — bug previo: el key del tracking Map no matcheaba).
      const globalName = globalChannelRef.current.topic;
      const state = globalChannelRef.current.state;
      if (debePurgarse(globalName, state)) {
        log.warn('Health check: global discovery channel dead — purging', {
          state,
          channelName: globalName,
          erroredDurationMs: firstErroredAtRef.current.has(globalName)
            ? now - (firstErroredAtRef.current.get(globalName) ?? now)
            : 0,
        });
        safeRemoveChannel(globalChannelRef.current, globalName);
        globalChannelRef.current = null;
        firstErroredAtRef.current.delete(globalName);
        purgedCount++;
      }
    }

    // Check chunk channels — collect dead ones first, then remove.
    // Iterating + deleting inside forEach is safe for Map, but
    // safeRemoveChannel triggers callbacks that could mutate state.
    const deadChannels: Array<[string, RealtimeChannel]> = [];
    presenceChannelsRef.current.forEach(
      (channel: RealtimeChannel, canalNombre: string) => {
        if (debePurgarse(canalNombre, channel.state)) {
          deadChannels.push([canalNombre, channel]);
        }
      },
    );

    for (const [canalNombre, channel] of deadChannels) {
      log.warn('Health check: chunk channel dead — purging', {
        channelName: canalNombre,
        state: channel.state,
        erroredDurationMs: firstErroredAtRef.current.has(canalNombre)
          ? now - (firstErroredAtRef.current.get(canalNombre) ?? now)
          : 0,
      });
      safeRemoveChannel(channel, canalNombre);
      presenceChannelsRef.current.delete(canalNombre);
      firstErroredAtRef.current.delete(canalNombre);
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
   * Fire `channel.untrack()` on every active presence channel without awaiting.
   *
   * Rationale: on `pagehide` / `beforeunload` we have no time for async work —
   * the browser will close the WebSocket as soon as the handler returns. But
   * `untrack()` enqueues its "untrack" message on the WebSocket's outbound
   * buffer synchronously (realtime-js calls `socket.push` immediately), so the
   * message ships before the socket closes even though its returned promise
   * never resolves. That broadcast triggers `presence_diff` on other clients,
   * which removes our avatar instantly instead of waiting for the server-side
   * presence heartbeat timeout (~30s).
   *
   * Includes the global empresa discovery channel — same-company users
   * discover each other through it, so we must untrack there too.
   */
  const untrackAll = useCallback((): void => {
    const channelCount = presenceChannelsRef.current.size;
    log.info('untrackAll() called on page exit', { channelCount, hasGlobalChannel: !!globalChannelRef.current });

    let untracked = 0;
    presenceChannelsRef.current.forEach((channel) => {
      try {
        log.debug('Untracking from channel', { channelState: (channel as any).state });
        void channel.untrack();
        untracked++;
      } catch (e) {
        log.warn('Error untracking from channel', { error: e instanceof Error ? e.message : String(e) });
      }
    });

    if (globalChannelRef.current) {
      try {
        log.debug('Untracking from global channel', { channelState: (globalChannelRef.current as any).state });
        void globalChannelRef.current.untrack();
        untracked++;
      } catch (e) {
        log.warn('Error untracking from global channel', { error: e instanceof Error ? e.message : String(e) });
      }
    }
    log.info('untrackAll() complete', { untracked });
  }, []);

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
    firstErroredAtRef.current.clear();
  }, [safeRemoveChannel]);

  return {
    syncPresenceByChunk,
    updatePresenceInChannels,
    forceRetrackAll,
    cleanup,
    checkChannelHealth,
    untrackAll,
  };
}
