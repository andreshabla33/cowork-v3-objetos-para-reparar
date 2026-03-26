export interface GalleryPolicyInput {
  participantIds: string[];
  localParticipantId?: string | null;
  featuredParticipantId?: string | null;
  activeSpeakerId?: string | null;
  activeSpeakerIds?: Iterable<string>;
  recentSpeakerIds?: Iterable<string>;
  raisedHandParticipantIds?: Iterable<string>;
}

export class GalleryPolicy {
  orderParticipantIds(input: GalleryPolicyInput): string[] {
    const seen = new Set<string>();
    const dedupedIds = input.participantIds.filter((participantId) => {
      if (!participantId || seen.has(participantId)) {
        return false;
      }
      seen.add(participantId);
      return true;
    });

    const originalIndex = new Map(dedupedIds.map((participantId, index) => [participantId, index]));

    return [...dedupedIds].sort((left, right) => {
      const priorityDiff = this.getPriority(left, input) - this.getPriority(right, input);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0);
    });
  }

  private getPriority(participantId: string, input: GalleryPolicyInput): number {
    const raisedHandParticipantIds = new Set(input.raisedHandParticipantIds ?? []);
    const activeSpeakerIds = Array.from(input.activeSpeakerIds ?? []);
    const recentSpeakerIds = Array.from(input.recentSpeakerIds ?? []);
    const activeSpeakerPriorityIndex = activeSpeakerIds.indexOf(participantId);
    const recentSpeakerPriorityIndex = recentSpeakerIds.indexOf(participantId);

    if (participantId === input.featuredParticipantId) {
      return 0;
    }

    if (activeSpeakerPriorityIndex >= 0) {
      return 10 + activeSpeakerPriorityIndex;
    }

    if (participantId === input.activeSpeakerId) {
      return 20;
    }

    if (recentSpeakerPriorityIndex >= 0) {
      return 25 + recentSpeakerPriorityIndex;
    }

    if (raisedHandParticipantIds.has(participantId)) {
      return 30;
    }

    if (participantId === input.localParticipantId) {
      return 40;
    }

    return 50;
  }
}
