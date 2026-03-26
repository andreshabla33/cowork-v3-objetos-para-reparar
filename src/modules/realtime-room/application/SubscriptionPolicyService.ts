export type SubscriptionVideoQuality = 'high' | 'medium' | 'low';
export type SubscriptionInterestTier = 'direct' | 'audio-range' | 'out-of-range';

export interface SubscriptionPolicyInput {
  currentUserId?: string | null;
  participantIds: string[];
  usersInCallCount: number;
  directProximityIds: Set<string>;
  audioRangeIds: Set<string>;
  speakingIds: Set<string>;
  lockedConversations: Map<string, string[]>;
}

export interface SubscriptionPolicyDecision {
  participantId: string;
  blocked: boolean;
  tier: SubscriptionInterestTier;
  shouldSubscribe: boolean;
  shouldEnable: boolean;
  preferredVideoQuality: SubscriptionVideoQuality | null;
  deferUnsubscribeMs: number | null;
}

export interface SubscriptionPolicySnapshot {
  blockedIds: Set<string>;
  directParticipantIds: Set<string>;
  audioRangeParticipantIds: Set<string>;
  inRangeParticipantIds: Set<string>;
  decisions: Map<string, SubscriptionPolicyDecision>;
}

export interface MeetingSubscriptionPolicyInput {
  participantIds: string[];
  visibleParticipantIds: Set<string>;
  speakerParticipantId?: string | null;
  recentSpeakerParticipantIds?: Iterable<string>;
  pageCapacity?: number;
  qualityMode: 'high' | 'medium' | 'low';
}

export interface MeetingSubscriptionPolicyDecision {
  participantId: string;
  shouldSubscribe: boolean;
  shouldEnable: boolean;
  preferredVideoQuality: SubscriptionVideoQuality | null;
}

export interface MeetingSubscriptionPolicySnapshot {
  visibleParticipantIds: Set<string>;
  decisions: Map<string, MeetingSubscriptionPolicyDecision>;
}

export interface SubscriptionPolicyServiceOptions {
  largeRoomThreshold?: number;
  deferredUnsubscribeMs?: number;
}

export class SubscriptionPolicyService {
  private largeRoomThreshold: number;
  private deferredUnsubscribeMs: number;

  constructor(options: SubscriptionPolicyServiceOptions = {}) {
    this.largeRoomThreshold = options.largeRoomThreshold ?? 8;
    this.deferredUnsubscribeMs = options.deferredUnsubscribeMs ?? 5000;
  }

  buildSnapshot(input: SubscriptionPolicyInput): SubscriptionPolicySnapshot {
    const blockedIds = this.resolveBlockedIds(input.currentUserId, input.lockedConversations);
    const inRangeParticipantIds = new Set<string>([
      ...input.directProximityIds,
      ...input.audioRangeIds,
    ]);
    const decisions = new Map<string, SubscriptionPolicyDecision>();

    input.participantIds.forEach((participantId) => {
      decisions.set(participantId, this.buildDecision({
        participantId,
        usersInCallCount: input.usersInCallCount,
        directProximityIds: input.directProximityIds,
        audioRangeIds: input.audioRangeIds,
        speakingIds: input.speakingIds,
        blockedIds,
      }));
    });

    return {
      blockedIds,
      directParticipantIds: new Set(input.directProximityIds),
      audioRangeParticipantIds: new Set(input.audioRangeIds),
      inRangeParticipantIds,
      decisions,
    };
  }

  buildMeetingSnapshot(input: MeetingSubscriptionPolicyInput): MeetingSubscriptionPolicySnapshot {
    const decisions = new Map<string, MeetingSubscriptionPolicyDecision>();
    const recentSpeakerParticipantIds = new Set(input.recentSpeakerParticipantIds ?? []);
    const visibleParticipantCount = input.visibleParticipantIds.size;
    const pageCapacity = Math.max(1, input.pageCapacity ?? visibleParticipantCount ?? 1);
    const pageDensity = visibleParticipantCount / pageCapacity;
    const isDensePage = visibleParticipantCount >= 9 || pageDensity >= 0.8;
    const isVeryDensePage = visibleParticipantCount >= 16 || pageDensity >= 0.92;

    input.participantIds.forEach((participantId) => {
      const isVisible = input.visibleParticipantIds.has(participantId);
      const isSpeaker = participantId === input.speakerParticipantId;
      const isRecentSpeaker = recentSpeakerParticipantIds.has(participantId);
      const preferredVideoQuality = !isVisible
        ? null
        : this.resolveMeetingVideoQuality({
            qualityMode: input.qualityMode,
            isSpeaker,
            isRecentSpeaker,
            visibleParticipantCount,
            isDensePage,
            isVeryDensePage,
            participantCount: input.participantIds.length,
          });

      decisions.set(participantId, {
        participantId,
        shouldSubscribe: isVisible,
        shouldEnable: isVisible,
        preferredVideoQuality,
      });
    });

    return {
      visibleParticipantIds: new Set(input.visibleParticipantIds),
      decisions,
    };
  }

  private resolveMeetingVideoQuality(input: {
    qualityMode: 'high' | 'medium' | 'low';
    isSpeaker: boolean;
    isRecentSpeaker: boolean;
    visibleParticipantCount: number;
    isDensePage: boolean;
    isVeryDensePage: boolean;
    participantCount: number;
  }): SubscriptionVideoQuality {
    if (input.isSpeaker) {
      if (input.qualityMode === 'low' || input.isVeryDensePage) {
        return 'medium';
      }

      return 'high';
    }

    if (input.isRecentSpeaker) {
      if (input.qualityMode === 'low' || input.isVeryDensePage) {
        return 'low';
      }

      return 'medium';
    }

    if (input.qualityMode === 'low') {
      return 'low';
    }

    if (input.isVeryDensePage) {
      return 'low';
    }

    if (input.qualityMode === 'medium' || input.isDensePage) {
      return 'medium';
    }

    if (input.visibleParticipantCount <= 4 && input.participantCount <= this.largeRoomThreshold) {
      return 'high';
    }

    return 'medium';
  }

  buildDecision(input: {
    participantId: string;
    usersInCallCount: number;
    directProximityIds: Set<string>;
    audioRangeIds: Set<string>;
    speakingIds: Set<string>;
    blockedIds: Set<string>;
  }): SubscriptionPolicyDecision {
    const { participantId, usersInCallCount, directProximityIds, audioRangeIds, speakingIds, blockedIds } = input;
    const blocked = blockedIds.has(participantId);
    const inDirectRange = directProximityIds.has(participantId);
    const inAudioRange = audioRangeIds.has(participantId);
    const isInRange = inDirectRange || inAudioRange;

    if (blocked) {
      return {
        participantId,
        blocked: true,
        tier: 'out-of-range',
        shouldSubscribe: false,
        shouldEnable: false,
        preferredVideoQuality: null,
        deferUnsubscribeMs: this.deferredUnsubscribeMs,
      };
    }

    if (!isInRange) {
      return {
        participantId,
        blocked: false,
        tier: 'out-of-range',
        shouldSubscribe: false,
        shouldEnable: false,
        preferredVideoQuality: null,
        deferUnsubscribeMs: this.deferredUnsubscribeMs,
      };
    }

    if (inDirectRange) {
      return {
        participantId,
        blocked: false,
        tier: 'direct',
        shouldSubscribe: true,
        shouldEnable: true,
        preferredVideoQuality: 'high',
        deferUnsubscribeMs: null,
      };
    }

    const isLargeRoom = usersInCallCount > this.largeRoomThreshold;
    const isSpeaking = speakingIds.has(participantId);

    return {
      participantId,
      blocked: false,
      tier: 'audio-range',
      shouldSubscribe: true,
      shouldEnable: true,
      preferredVideoQuality: isLargeRoom && !isSpeaking ? 'low' : 'medium',
      deferUnsubscribeMs: null,
    };
  }

  shouldSubscribeOnTrackPublished(snapshot: SubscriptionPolicySnapshot | null, participantId: string): boolean {
    return snapshot?.decisions.get(participantId)?.shouldSubscribe ?? false;
  }

  private resolveBlockedIds(currentUserId: string | null | undefined, lockedConversations: Map<string, string[]>): Set<string> {
    const blockedIds = new Set<string>();

    lockedConversations.forEach((participants, lockerId) => {
      if (!currentUserId || participants.includes(currentUserId)) {
        return;
      }

      participants.forEach((participantId) => blockedIds.add(participantId));
      blockedIds.add(lockerId);
    });

    return blockedIds;
  }
}
