import type { VisualLayoutMode } from './ViewportFitPolicy';

export interface ActiveSpeakerPolicyInput {
  participantIds: string[];
  activeSpeakerId?: string | null;
  pinnedParticipantId?: string | null;
  effectiveMode: VisualLayoutMode;
}

export class ActiveSpeakerPolicy {
  resolveFeaturedParticipantId(input: ActiveSpeakerPolicyInput): string | null {
    const availableIds = new Set(input.participantIds.filter(Boolean));

    if (input.pinnedParticipantId && availableIds.has(input.pinnedParticipantId)) {
      return input.pinnedParticipantId;
    }

    if (input.effectiveMode === 'speaker' && input.activeSpeakerId && availableIds.has(input.activeSpeakerId)) {
      return input.activeSpeakerId;
    }

    if (input.effectiveMode === 'speaker') {
      return input.participantIds.find(Boolean) ?? null;
    }

    return null;
  }
}
