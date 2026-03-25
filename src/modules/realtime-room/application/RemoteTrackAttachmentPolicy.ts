export type RemoteTrackAttachmentSlot = 'camera' | 'screen_share' | 'audio';
export type RemoteTrackAttachmentAction = 'attach' | 'detach' | 'noop';

export interface RemoteTrackAttachmentDecision {
  action: RemoteTrackAttachmentAction;
  participantId: string;
  slot: RemoteTrackAttachmentSlot;
  trackId: string | null;
}

export interface RemoteTrackAttachmentState {
  camera: Map<string, string>;
  screen_share: Map<string, string>;
  audio: Map<string, string>;
}

export class RemoteTrackAttachmentPolicy {
  onTrackSubscribed(input: {
    participantId: string;
    slot: RemoteTrackAttachmentSlot;
    trackId: string;
    currentTrackId: string | null;
  }): RemoteTrackAttachmentDecision {
    if (input.currentTrackId === input.trackId) {
      return {
        action: 'noop',
        participantId: input.participantId,
        slot: input.slot,
        trackId: input.trackId,
      };
    }

    return {
      action: 'attach',
      participantId: input.participantId,
      slot: input.slot,
      trackId: input.trackId,
    };
  }

  onTrackUnsubscribed(input: {
    participantId: string;
    slot: RemoteTrackAttachmentSlot;
    trackId: string;
    currentTrackId: string | null;
  }): RemoteTrackAttachmentDecision {
    if (!input.currentTrackId || input.currentTrackId !== input.trackId) {
      return {
        action: 'noop',
        participantId: input.participantId,
        slot: input.slot,
        trackId: input.trackId,
      };
    }

    return {
      action: 'detach',
      participantId: input.participantId,
      slot: input.slot,
      trackId: input.trackId,
    };
  }

  buildParticipantDetachPlan(state: RemoteTrackAttachmentState, participantId: string): RemoteTrackAttachmentDecision[] {
    const slots: RemoteTrackAttachmentSlot[] = ['camera', 'screen_share', 'audio'];

    return slots.flatMap((slot) => {
      const trackId = state[slot].get(participantId) ?? null;
      if (!trackId) {
        return [];
      }

      return [{
        action: 'detach',
        participantId,
        slot,
        trackId,
      }];
    });
  }
}
