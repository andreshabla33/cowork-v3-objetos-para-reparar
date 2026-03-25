export interface GalleryPolicyInput {
  participantIds: string[];
  localParticipantId?: string | null;
  featuredParticipantId?: string | null;
  activeSpeakerId?: string | null;
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
    if (participantId === input.featuredParticipantId) {
      return 0;
    }
    if (participantId === input.activeSpeakerId) {
      return 1;
    }
    if (raisedHandParticipantIds.has(participantId)) {
      return 2;
    }
    if (participantId === input.localParticipantId) {
      return 3;
    }
    return 4;
  }
}
