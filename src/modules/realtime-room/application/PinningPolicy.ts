export interface PinningPolicyInput {
  participantIds: string[];
  currentPinnedParticipantId?: string | null;
  requestedPinnedParticipantId?: string | null;
}

export class PinningPolicy {
  resolvePinnedParticipantId(input: PinningPolicyInput): string | null {
    const availableIds = new Set(input.participantIds.filter(Boolean));
    const currentPinned = input.currentPinnedParticipantId && availableIds.has(input.currentPinnedParticipantId)
      ? input.currentPinnedParticipantId
      : null;

    if (input.requestedPinnedParticipantId === undefined) {
      return currentPinned;
    }

    if (!input.requestedPinnedParticipantId || !availableIds.has(input.requestedPinnedParticipantId)) {
      return null;
    }

    if (currentPinned === input.requestedPinnedParticipantId) {
      return null;
    }

    return input.requestedPinnedParticipantId;
  }
}
