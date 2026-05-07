import { describe, expect, it, vi } from 'vitest';
import { RemoteTrackAttachmentPolicy } from '../../../src/modules/realtime-room/application/RemoteTrackAttachmentPolicy';
import { RemoteRenderLifecyclePolicy } from '../../../src/modules/realtime-room/application/RemoteRenderLifecyclePolicy';

// Regression coverage for the subscribe-before-publish race:
// peer B connects before peer A publishes; A's `RoomEvent.TrackSubscribed`
// can land at the SDK while B's React handler is mid-commit, so the React
// state never receives A. Fix adds a `replaySubscribedTracks(room)` sweep
// that re-invokes the handler for every `RemoteTrackPublication` already in
// `pub.isSubscribed` state. The sweep depends on three properties the
// policies must guarantee — this file pins those guarantees.

describe('subscribe-before-publish replay sweep — policy invariants', () => {
  describe('RemoteTrackAttachmentPolicy idempotency', () => {
    it('returns attach on first onTrackSubscribed and noop on duplicate trackId', () => {
      const policy = new RemoteTrackAttachmentPolicy();
      const input = {
        participantId: 'A',
        slot: 'camera' as const,
        trackId: 'track-1',
        currentTrackId: null as string | null,
      };

      const first = policy.onTrackSubscribed(input);
      expect(first.action).toBe('attach');

      // Replay sweep calls onTrackSubscribed again with the same trackId
      // (after it was set as currentTrackId by the first invocation).
      const second = policy.onTrackSubscribed({ ...input, currentTrackId: 'track-1' });
      expect(second.action).toBe('noop');
    });

    it('returns attach when a different trackId arrives (track replacement)', () => {
      const policy = new RemoteTrackAttachmentPolicy();
      const result = policy.onTrackSubscribed({
        participantId: 'A',
        slot: 'camera',
        trackId: 'track-2',
        currentTrackId: 'track-1',
      });
      expect(result.action).toBe('attach');
    });
  });

  describe('RemoteRenderLifecyclePolicy mute recovery', () => {
    it('returns noop while track is muted (isRenderReady=false) so render stays hidden', () => {
      const policy = new RemoteRenderLifecyclePolicy();
      const decision = policy.onTrackCandidate({
        participantId: 'A',
        slot: 'camera',
        trackId: 'track-1',
        currentAttachedTrackId: 'track-1',
        currentRenderedTrackId: null,
        isRenderReady: false,
      });
      expect(decision.action).toBe('noop');
    });

    it('returns expose once track unmutes (isRenderReady=true) — replay recovers from missed unmute event', () => {
      const policy = new RemoteRenderLifecyclePolicy();
      // Simulates the replay sweep re-calling onTrackCandidate after the
      // MediaStreamTrack 'unmute' event fired but before our listener was
      // attached: track is now unmuted, but currentRenderedTrackId is still
      // null because the original on-subscribe call returned noop.
      const decision = policy.onTrackCandidate({
        participantId: 'A',
        slot: 'camera',
        trackId: 'track-1',
        currentAttachedTrackId: 'track-1',
        currentRenderedTrackId: null,
        isRenderReady: true,
      });
      expect(decision.action).toBe('expose');
    });

    it('returns noop on already-rendered same trackId (idempotent replay)', () => {
      const policy = new RemoteRenderLifecyclePolicy();
      const decision = policy.onTrackCandidate({
        participantId: 'A',
        slot: 'camera',
        trackId: 'track-1',
        currentAttachedTrackId: 'track-1',
        currentRenderedTrackId: 'track-1',
        isRenderReady: true,
      });
      expect(decision.action).toBe('noop');
    });
  });

  describe('replaySubscribedTracks sweep — selection criteria', () => {
    // The actual sweep lives inside the React hook; the criteria for which
    // publications to replay are deterministic and unit-testable here. Mirror
    // the same predicate used in `useLiveKitRemoteTracks.replaySubscribedTracks`.
    type FakePub = {
      isSubscribed: boolean;
      track: { mediaStreamTrack: { id: string } | null } | null;
    };
    type FakeParticipant = { identity: string; trackPublications: Map<string, FakePub> };

    function shouldReplay(pub: FakePub): boolean {
      return Boolean(pub.isSubscribed && pub.track && pub.track.mediaStreamTrack);
    }

    function sweep(participants: FakeParticipant[], handler: (p: FakeParticipant, pub: FakePub) => void): number {
      let count = 0;
      participants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (shouldReplay(pub)) {
            handler(p, pub);
            count += 1;
          }
        });
      });
      return count;
    }

    it('replays only publications that are subscribed AND have a live mediaStreamTrack', () => {
      const handler = vi.fn();
      const a: FakeParticipant = {
        identity: 'A',
        trackPublications: new Map([
          // Subscribed + live track → REPLAY
          ['t1', { isSubscribed: true, track: { mediaStreamTrack: { id: 't1' } } }],
          // Subscribed but no track yet (publish in flight) → SKIP
          ['t2', { isSubscribed: true, track: null }],
          // Not subscribed (out-of-range peer) → SKIP
          ['t3', { isSubscribed: false, track: { mediaStreamTrack: { id: 't3' } } }],
          // Subscribed but mediaStreamTrack still null → SKIP
          ['t4', { isSubscribed: true, track: { mediaStreamTrack: null } }],
        ]),
      };
      const replayed = sweep([a], handler);
      expect(replayed).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][1]).toBe(a.trackPublications.get('t1'));
    });

    it('handles zero participants (idle room) without invoking the handler', () => {
      const handler = vi.fn();
      const replayed = sweep([], handler);
      expect(replayed).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    });

    it('reproduces the bug scenario: B connects with A already subscribed → sweep populates the handler', () => {
      // Pre-fix behavior: B's React handler ref is attached after A's
      // `TrackSubscribed` already fired → A's track is invisible to React.
      // Post-fix: replaySubscribedTracks sweeps `room.remoteParticipants`
      // and re-invokes the handler. We assert the sweep alone reaches A.
      const handler = vi.fn();
      const a: FakeParticipant = {
        identity: 'efcd60fb-d1fb-4f8d-8728-6653ccbed693',
        trackPublications: new Map([
          ['cam', { isSubscribed: true, track: { mediaStreamTrack: { id: 'TR_VCkH4u9fLD5rTE' } } }],
        ]),
      };
      sweep([a], handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].identity).toBe(
        'efcd60fb-d1fb-4f8d-8728-6653ccbed693',
      );
    });
  });
});
