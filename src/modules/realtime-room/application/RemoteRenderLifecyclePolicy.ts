export type RemoteRenderSlot = 'camera' | 'screen_share';
export type RemoteRenderAction = 'expose' | 'hide' | 'noop';

export interface RemoteRenderDecision {
  action: RemoteRenderAction;
  participantId: string;
  slot: RemoteRenderSlot;
  trackId: string;
}

export interface RemoteRenderLifecycleState {
  camera: Map<string, string>;
  screen_share: Map<string, string>;
}

export class RemoteRenderLifecyclePolicy {
  isTrackRenderReady(track: MediaStreamTrack): boolean {
    return track.readyState === 'live' && !track.muted;
  }

  onTrackCandidate(input: {
    participantId: string;
    slot: RemoteRenderSlot;
    trackId: string;
    currentAttachedTrackId: string | null;
    currentRenderedTrackId: string | null;
    isRenderReady: boolean;
  }): RemoteRenderDecision {
    if (input.currentAttachedTrackId !== input.trackId) {
      return {
        action: 'noop',
        participantId: input.participantId,
        slot: input.slot,
        trackId: input.trackId,
      };
    }

    if (!input.isRenderReady) {
      return {
        action: input.currentRenderedTrackId === input.trackId ? 'hide' : 'noop',
        participantId: input.participantId,
        slot: input.slot,
        trackId: input.trackId,
      };
    }

    return {
      action: input.currentRenderedTrackId === input.trackId ? 'noop' : 'expose',
      participantId: input.participantId,
      slot: input.slot,
      trackId: input.trackId,
    };
  }

  onTrackUnsubscribed(input: {
    participantId: string;
    slot: RemoteRenderSlot;
    trackId: string;
    currentRenderedTrackId: string | null;
  }): RemoteRenderDecision {
    return {
      action: input.currentRenderedTrackId === input.trackId ? 'hide' : 'noop',
      participantId: input.participantId,
      slot: input.slot,
      trackId: input.trackId,
    };
  }

  buildParticipantHidePlan(state: RemoteRenderLifecycleState, participantId: string): RemoteRenderDecision[] {
    const slots: RemoteRenderSlot[] = ['camera', 'screen_share'];

    return slots.flatMap((slot) => {
      const trackId = state[slot].get(participantId);
      if (!trackId) {
        return [];
      }

      return [{
        action: 'hide',
        participantId,
        slot,
        trackId,
      }];
    });
  }
}
