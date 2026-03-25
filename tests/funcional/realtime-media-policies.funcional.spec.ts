import { test, expect } from '@playwright/test';
import { RemoteRenderLifecyclePolicy } from '@/src/modules/realtime-room/application/RemoteRenderLifecyclePolicy';
import { RemoteTrackAttachmentPolicy } from '@/src/modules/realtime-room/application/RemoteTrackAttachmentPolicy';
import { SubscriptionPolicyService } from '@/src/modules/realtime-room/application/SubscriptionPolicyService';
import { RealtimeSessionTelemetry } from '@/src/modules/realtime-room/application/RealtimeSessionTelemetry';

test.describe('FUNCIONAL: políticas realtime/media', () => {
  test('F-RTM-01: SubscriptionPolicyService prioriza calidad y suscripción por proximidad', async () => {
    const service = new SubscriptionPolicyService({ largeRoomThreshold: 3, deferredUnsubscribeMs: 2500 });
    const snapshot = service.buildSnapshot({
      currentUserId: 'me',
      participantIds: ['direct-user', 'audio-user', 'out-user', 'locked-user'],
      usersInCallCount: 6,
      directProximityIds: new Set(['direct-user']),
      audioRangeIds: new Set(['audio-user']),
      speakingIds: new Set<string>(),
      lockedConversations: new Map([['locker-1', ['locked-user']]]),
    });

    expect(snapshot.decisions.get('direct-user')).toMatchObject({
      blocked: false,
      tier: 'direct',
      shouldSubscribe: true,
      shouldEnable: true,
      preferredVideoQuality: 'high',
      deferUnsubscribeMs: null,
    });

    expect(snapshot.decisions.get('audio-user')).toMatchObject({
      blocked: false,
      tier: 'audio-range',
      shouldSubscribe: true,
      shouldEnable: true,
      preferredVideoQuality: 'low',
      deferUnsubscribeMs: null,
    });

    expect(snapshot.decisions.get('out-user')).toMatchObject({
      blocked: false,
      tier: 'out-of-range',
      shouldSubscribe: false,
      shouldEnable: false,
      preferredVideoQuality: null,
      deferUnsubscribeMs: 2500,
    });

    expect(snapshot.decisions.get('locked-user')).toMatchObject({
      blocked: true,
      tier: 'out-of-range',
      shouldSubscribe: false,
      shouldEnable: false,
      preferredVideoQuality: null,
      deferUnsubscribeMs: 2500,
    });
  });

  test('F-RTM-02: RemoteRenderLifecyclePolicy solo expone tracks render-ready y oculta stale/unsubscribed', async () => {
    const policy = new RemoteRenderLifecyclePolicy();

    expect(policy.onTrackCandidate({
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-a',
      currentAttachedTrackId: 'track-a',
      currentRenderedTrackId: null,
      isRenderReady: true,
    })).toEqual({
      action: 'expose',
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-a',
    });

    expect(policy.onTrackCandidate({
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-a',
      currentAttachedTrackId: 'track-a',
      currentRenderedTrackId: 'track-a',
      isRenderReady: false,
    })).toEqual({
      action: 'hide',
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-a',
    });

    expect(policy.onTrackCandidate({
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-b',
      currentAttachedTrackId: 'track-a',
      currentRenderedTrackId: 'track-a',
      isRenderReady: true,
    }).action).toBe('noop');

    expect(policy.onTrackUnsubscribed({
      participantId: 'user-1',
      slot: 'camera',
      trackId: 'track-a',
      currentRenderedTrackId: 'track-a',
    }).action).toBe('hide');
  });

  test('F-RTM-03: RemoteTrackAttachmentPolicy evita attach/detach redundantes y genera cleanup plan', async () => {
    const policy = new RemoteTrackAttachmentPolicy();

    expect(policy.onTrackSubscribed({
      participantId: 'user-1',
      slot: 'audio',
      trackId: 'audio-track-1',
      currentTrackId: null,
    })).toEqual({
      action: 'attach',
      participantId: 'user-1',
      slot: 'audio',
      trackId: 'audio-track-1',
    });

    expect(policy.onTrackSubscribed({
      participantId: 'user-1',
      slot: 'audio',
      trackId: 'audio-track-1',
      currentTrackId: 'audio-track-1',
    }).action).toBe('noop');

    expect(policy.onTrackUnsubscribed({
      participantId: 'user-1',
      slot: 'screen_share',
      trackId: 'screen-track-1',
      currentTrackId: 'screen-track-1',
    }).action).toBe('detach');

    expect(policy.buildParticipantDetachPlan({
      camera: new Map([['user-1', 'cam-1']]),
      screen_share: new Map([['user-1', 'screen-1']]),
      audio: new Map([['user-1', 'audio-1']]),
    }, 'user-1')).toEqual([
      { action: 'detach', participantId: 'user-1', slot: 'camera', trackId: 'cam-1' },
      { action: 'detach', participantId: 'user-1', slot: 'screen_share', trackId: 'screen-1' },
      { action: 'detach', participantId: 'user-1', slot: 'audio', trackId: 'audio-1' },
    ]);
  });

  test('F-RTM-04: RealtimeSessionTelemetry agrega snapshots correlados por sesión', async () => {
    const telemetry = new RealtimeSessionTelemetry({
      enabled: false,
      scope: 'TestRealtimeTelemetry',
      sessionKey: 'qa-session-1',
      maxEvents: 3,
    });

    telemetry.clear();
    telemetry.record({ category: 'meeting_access', name: 'token_fetch_started', data: { salaId: 'sala-1' } });
    telemetry.record({ category: 'meeting_realtime', name: 'meeting_chat_message_sent', data: { length: 12 } });
    telemetry.record({ category: 'meeting_quality', name: 'meeting_quality_state_changed', severity: 'warn', data: { mode: 'low' } });
    telemetry.record({ category: 'space_realtime', name: 'subscription_policy_applied', data: { inRangeParticipants: 3 } });

    const snapshot = telemetry.getSnapshot();

    expect(snapshot.sessionKey).toBe('qa-session-1');
    expect(snapshot.totalEvents).toBe(3);
    expect(snapshot.countsByCategory.meeting_realtime).toBe(1);
    expect(snapshot.countsByCategory.meeting_quality).toBe(1);
    expect(snapshot.countsByCategory.space_realtime).toBe(1);
    expect(snapshot.countsBySeverity.warn).toBe(1);
    expect(snapshot.events.at(-1)?.name).toBe('subscription_policy_applied');
  });
});
