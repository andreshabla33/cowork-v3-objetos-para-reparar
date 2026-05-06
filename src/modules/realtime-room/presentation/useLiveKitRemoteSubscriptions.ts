/**
 * @module modules/realtime-room/presentation/useLiveKitRemoteSubscriptions
 * @description Sub-hook of the P0-03 useLiveKit decomposition: drives the
 * 3-tier remote-subscription policy. Decides which peers to subscribe to,
 * which to keep audio-only, which to disable temporarily and which to
 * unsubscribe (deferred) based on proximity, audio range, speaker hints
 * and locked conversations. Clamps preferred video quality by the user's
 * performance settings (graphicsQuality + batterySaver). Also wires the
 * RoomEvent.TrackPublished handler so newly-published tracks of in-range
 * peers are subscribed immediately.
 *
 * Publishes a `subscriptionPolicyReset` callback via output ref so the
 * Coordinator's onReconnected handler (in Lifecycle) and the room-tear
 * down path (limpiarLivekit) can drop all policy caches in one call.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs (livekit-client / docs.livekit.io):
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/RemoteTrackPublication.html
 *     (setSubscribed / setEnabled / setVideoQuality)
 *   - https://docs.livekit.io/reference/client-sdk-js/enums/Track.Kind.html
 *   - https://docs.livekit.io/reference/client-sdk-js/enums/VideoQuality.html
 *   - https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html
 *     (TrackPublished)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { RemoteParticipant, Room } from 'livekit-client';
import { RemoteTrackPublication, RoomEvent, Track, VideoQuality } from 'livekit-client';
import type { User } from '@/types';
import { SubscriptionPolicyService } from '@/modules/realtime-room';

type RecordTelemetry = (
  name: string,
  data?: Record<string, unknown>,
  severity?: 'info' | 'warn' | 'error',
  category?: 'remote_media' | 'subscription_policy' | 'meeting_access' | 'meeting_realtime' | 'meeting_quality' | 'space_realtime',
) => void;

export interface UseLiveKitRemoteSubscriptionsParams {
  livekitRoomRef: React.MutableRefObject<Room | null>;
  livekitConnected: boolean;
  session: Session | null;
  usersInCall: User[];
  usersInAudioRange: User[];
  conversacionesBloqueadasRemoto: Map<string, string[]>;
  performanceSettings?: { graphicsQuality?: string; batterySaver?: boolean };
  speakingUsersRef: React.MutableRefObject<Set<string>>;
  recordTelemetry: RecordTelemetry;
  subscriptionPolicyResetOutRef: React.MutableRefObject<(() => void) | null>;
}

export function useLiveKitRemoteSubscriptions(params: UseLiveKitRemoteSubscriptionsParams): void {
  const {
    livekitRoomRef, livekitConnected, session,
    usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto,
    performanceSettings, speakingUsersRef,
    recordTelemetry, subscriptionPolicyResetOutRef,
  } = params;

  const subscriptionPolicyServiceRef = useRef(new SubscriptionPolicyService());
  const subscriptionPolicySnapshotRef = useRef<ReturnType<SubscriptionPolicyService['buildSnapshot']> | null>(null);
  const livekitTransportSubscribedRef = useRef<Set<string>>(new Set());
  const livekitSubscribedIdsRef = useRef<Set<string>>(new Set());
  const livekitAudioOnlyIdsRef = useRef<Set<string>>(new Set());
  const pendingUnsubscribeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const appliedRemotePublicationStateRef = useRef<
    Map<string, { enabled: boolean | null; quality: VideoQuality | null; subscribed: boolean | null }>
  >(new Map());
  const lastPolicySummaryRef = useRef<string>('');

  const mapVideoQuality = useCallback((quality: 'high' | 'medium' | 'low') => {
    if (quality === 'low') return VideoQuality.LOW;
    if (quality === 'medium') return VideoQuality.MEDIUM;
    return VideoQuality.HIGH;
  }, []);

  const clampPreferredVideoQuality = useCallback((quality: 'high' | 'medium' | 'low' | null) => {
    if (!quality) return null;
    const graphicsQuality = performanceSettings?.graphicsQuality ?? 'auto';
    const batterySaverEnabled = Boolean(performanceSettings?.batterySaver);
    if (batterySaverEnabled || graphicsQuality === 'low') {
      return quality === 'high' ? 'medium' : 'low';
    }
    if (graphicsQuality === 'medium' && quality === 'high') {
      return 'medium';
    }
    return quality;
  }, [performanceSettings?.batterySaver, performanceSettings?.graphicsQuality]);

  // Late-binding reset published via output ref (consumed by Lifecycle on
  // reconnected and limpiarLivekit). Drops all caches so the next policy
  // application re-evaluates from scratch (after moveParticipant the SFU
  // already discarded all subscriptions on its side).
  useEffect(() => {
    subscriptionPolicyResetOutRef.current = () => {
      livekitTransportSubscribedRef.current.clear();
      livekitSubscribedIdsRef.current = new Set();
      livekitAudioOnlyIdsRef.current = new Set();
      pendingUnsubscribeTimersRef.current.forEach((t) => clearTimeout(t));
      pendingUnsubscribeTimersRef.current.clear();
      appliedRemotePublicationStateRef.current.clear();
      lastPolicySummaryRef.current = '';
    };
  }, [subscriptionPolicyResetOutRef]);

  // Apply the 3-tier subscription policy whenever proximity, audio range or
  // speaker hints change.
  useEffect(() => {
    if (!livekitConnected) return;
    const room = livekitRoomRef.current;
    if (!room) return;

    const idsEnProximidad = new Set(usersInCall.map((u) => u.id));
    const idsEnAudioRange = new Set(usersInAudioRange.map((u) => u.id));
    const idsTransportSuscritos = livekitTransportSubscribedRef.current;

    const policySnapshot = subscriptionPolicyServiceRef.current.buildSnapshot({
      currentUserId: session?.user?.id,
      participantIds: Array.from(room.remoteParticipants.keys()),
      usersInCallCount: usersInCall.length,
      directProximityIds: idsEnProximidad,
      audioRangeIds: idsEnAudioRange,
      speakingIds: speakingUsersRef.current,
      lockedConversations: conversacionesBloqueadasRemoto,
    });
    subscriptionPolicySnapshotRef.current = policySnapshot;
    const qualityCeiling = clampPreferredVideoQuality('high') ?? 'high';
    const policySummary = JSON.stringify({
      inRange: policySnapshot.inRangeParticipantIds.size,
      direct: policySnapshot.directParticipantIds.size,
      audioRange: policySnapshot.audioRangeParticipantIds.size,
      qualityCeiling,
      batterySaver: Boolean(performanceSettings?.batterySaver),
      graphicsQuality: performanceSettings?.graphicsQuality ?? 'auto',
    });
    if (lastPolicySummaryRef.current !== policySummary) {
      lastPolicySummaryRef.current = policySummary;
      recordTelemetry('subscription_policy_applied', {
        inRangeParticipants: policySnapshot.inRangeParticipantIds.size,
        directParticipants: policySnapshot.directParticipantIds.size,
        audioRangeParticipants: policySnapshot.audioRangeParticipantIds.size,
        qualityCeiling,
        batterySaver: Boolean(performanceSettings?.batterySaver),
        graphicsQuality: performanceSettings?.graphicsQuality ?? 'auto',
      }, 'info', 'subscription_policy');
    }

    // SUBSCRIBE in-range
    policySnapshot.inRangeParticipantIds.forEach((userId) => {
      const participant = room.getParticipantByIdentity(userId);
      if (!participant) return;
      const decision = policySnapshot.decisions.get(userId);
      if (!decision?.shouldSubscribe) return;

      const pendingTimer = pendingUnsubscribeTimersRef.current.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingUnsubscribeTimersRef.current.delete(userId);
      }

      participant.trackPublications.forEach((pub) => {
        if (!(pub instanceof RemoteTrackPublication)) return;
        const stateKey = `${userId}:${pub.trackSid}`;
        const previousState = appliedRemotePublicationStateRef.current.get(stateKey)
          ?? { enabled: null, quality: null, subscribed: null };
        if (!pub.isSubscribed) {
          pub.setSubscribed(true);
          previousState.subscribed = true;
        }
        appliedRemotePublicationStateRef.current.set(stateKey, previousState);
      });
      participant.trackPublications.forEach((pub) => {
        if (pub instanceof RemoteTrackPublication && pub.isSubscribed) {
          const stateKey = `${userId}:${pub.trackSid}`;
          const previousState = appliedRemotePublicationStateRef.current.get(stateKey)
            ?? { enabled: null, quality: null, subscribed: null };
          if (pub.isEnabled !== decision.shouldEnable) {
            pub.setEnabled(decision.shouldEnable);
            previousState.enabled = decision.shouldEnable;
          }
          const effectivePreferredQuality = clampPreferredVideoQuality(decision.preferredVideoQuality);
          if (pub.kind === Track.Kind.Video && effectivePreferredQuality) {
            const mappedQuality = mapVideoQuality(effectivePreferredQuality);
            if (previousState.quality !== mappedQuality) {
              pub.setVideoQuality(mappedQuality);
              previousState.quality = mappedQuality;
            }
          }
          previousState.subscribed = true;
          appliedRemotePublicationStateRef.current.set(stateKey, previousState);
        }
      });
      idsTransportSuscritos.add(userId);
    });

    // DISABLE + deferred UNSUBSCRIBE for peers out of range
    idsTransportSuscritos.forEach((userId) => {
      const decision = policySnapshot.decisions.get(userId);
      if (decision?.shouldSubscribe) return;
      const participant = room.getParticipantByIdentity(userId);
      if (participant) {
        participant.trackPublications.forEach((pub) => {
          if (pub instanceof RemoteTrackPublication && pub.isSubscribed && pub.isEnabled) {
            pub.setEnabled(false);
            const stateKey = `${userId}:${pub.trackSid}`;
            const previousState = appliedRemotePublicationStateRef.current.get(stateKey)
              ?? { enabled: null, quality: null, subscribed: null };
            previousState.enabled = false;
            previousState.subscribed = true;
            appliedRemotePublicationStateRef.current.set(stateKey, previousState);
          }
        });
      }
      if (!pendingUnsubscribeTimersRef.current.has(userId)) {
        const timer = setTimeout(() => {
          pendingUnsubscribeTimersRef.current.delete(userId);
          if (livekitSubscribedIdsRef.current.has(userId) || livekitAudioOnlyIdsRef.current.has(userId)) {
            const p = room.getParticipantByIdentity(userId);
            if (p) p.trackPublications.forEach((pub) => {
              if (pub instanceof RemoteTrackPublication && pub.isSubscribed && !pub.isEnabled) {
                pub.setEnabled(true);
              }
            });
            return;
          }
          const p = room.getParticipantByIdentity(userId);
          if (p) p.trackPublications.forEach((pub) => {
            if (pub instanceof RemoteTrackPublication && pub.isSubscribed) {
              pub.setSubscribed(false);
              appliedRemotePublicationStateRef.current.delete(`${userId}:${pub.trackSid}`);
            }
          });
          idsTransportSuscritos.delete(userId);
          recordTelemetry('subscription_policy_unsubscribed_deferred', {
            participantId: userId,
            deferMs: decision?.deferUnsubscribeMs ?? 5000,
          }, 'info', 'subscription_policy');
        }, decision?.deferUnsubscribeMs ?? 5000);
        pendingUnsubscribeTimersRef.current.set(userId, timer);
      }
    });

    livekitSubscribedIdsRef.current = policySnapshot.directParticipantIds;
    livekitAudioOnlyIdsRef.current = policySnapshot.audioRangeParticipantIds;
  }, [
    livekitRoomRef, livekitConnected,
    usersInCall, usersInAudioRange, conversacionesBloqueadasRemoto,
    session?.user?.id,
    mapVideoQuality, clampPreferredVideoQuality,
    performanceSettings?.batterySaver, performanceSettings?.graphicsQuality,
    speakingUsersRef,
    recordTelemetry,
  ]);

  // Subscribe newly published tracks of peers already in range.
  useEffect(() => {
    if (!livekitConnected) return;
    const room = livekitRoomRef.current;
    if (!room) return;
    const handleTrackPublished = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (!participant) return;
      if (!subscriptionPolicyServiceRef.current.shouldSubscribeOnTrackPublished(
        subscriptionPolicySnapshotRef.current,
        participant.identity,
      )) {
        recordTelemetry('track_published_subscription_skipped', {
          participantId: participant.identity,
          trackSid: publication?.trackSid,
        }, 'info', 'subscription_policy');
        return;
      }
      if (!publication.isSubscribed) {
        publication.setSubscribed(true);
        livekitTransportSubscribedRef.current.add(participant.identity);
        recordTelemetry('track_published_subscription_enabled', {
          participantId: participant.identity,
          trackSid: publication?.trackSid,
        }, 'info', 'subscription_policy');
      }
    };
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    return () => { room.off(RoomEvent.TrackPublished, handleTrackPublished); };
  }, [livekitRoomRef, livekitConnected, recordTelemetry]);
}
