export interface RaiseHandDecision {
  packet: {
    participantId: string;
    raised: boolean;
    by: string;
  };
  raisedHandParticipantIds: Set<string>;
}

export interface RaiseHandToggleInput {
  participantId: string;
  participantName: string;
  raisedHandParticipantIds: Iterable<string>;
}

export interface RaiseHandApplyInput {
  participantId: string;
  participantName: string;
  raised: boolean;
  raisedHandParticipantIds: Iterable<string>;
}

export class RaiseHandUseCase {
  toggle(input: RaiseHandToggleInput): RaiseHandDecision {
    const current = new Set(input.raisedHandParticipantIds);
    const raised = !current.has(input.participantId);
    return this.apply({
      participantId: input.participantId,
      participantName: input.participantName,
      raised,
      raisedHandParticipantIds: current,
    });
  }

  apply(input: RaiseHandApplyInput): RaiseHandDecision {
    const next = new Set(input.raisedHandParticipantIds);
    if (input.raised) {
      next.add(input.participantId);
    } else {
      next.delete(input.participantId);
    }

    return {
      packet: {
        participantId: input.participantId,
        raised: input.raised,
        by: input.participantName,
      },
      raisedHandParticipantIds: next,
    };
  }
}
