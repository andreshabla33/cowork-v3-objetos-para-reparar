import type { VisualLayoutMode } from './ViewportFitPolicy';
import { MeetingLayoutModelBuilder, type MeetingLayoutModel } from './MeetingLayoutModel';
import { SpaceVideoHudLayoutModelBuilder, type SpaceVideoHudLayoutModel } from './SpaceVideoHudLayoutModel';

export interface MeetingVisualSnapshotInput<TTrack> {
  tracks: TTrack[];
  localParticipantId?: string;
  hideSelfView: boolean;
  keepSelfViewVisible: boolean;
  effectiveViewMode: VisualLayoutMode;
  featuredParticipantId?: string | null;
  screenShareTrack?: TTrack | null;
  getTrackParticipantId: (track: TTrack) => string | null | undefined;
}

export interface MeetingVisualSnapshotResult<TTrack> {
  visibleTracks: TTrack[];
  layoutSnapshot: MeetingLayoutModel<TTrack>;
}

export interface SpaceVideoHudSnapshotInput<TUser> {
  usersInCall: TUser[];
  orderedUsersInCall: TUser[];
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  speakingUsers: Set<string>;
  raisedHandParticipantIds?: Set<string>;
  userDistances: Map<string, number>;
  getParticipantId: (user: TUser) => string;
  getParticipantCameraEnabled: (user: TUser) => boolean;
}

export interface SpaceVideoHudSnapshotResult<TUser> {
  layoutSnapshot: SpaceVideoHudLayoutModel<TUser>;
}

export class VisualSnapshotService {
  private readonly meetingLayoutModelBuilder = new MeetingLayoutModelBuilder();
  private readonly spaceVideoHudLayoutModelBuilder = new SpaceVideoHudLayoutModelBuilder();

  buildMeetingVisualSnapshot<TTrack>(input: MeetingVisualSnapshotInput<TTrack>): MeetingVisualSnapshotResult<TTrack> {
    const visibleTracks = !input.hideSelfView || input.keepSelfViewVisible || !input.localParticipantId
      ? input.tracks
      : input.tracks.filter((track) => input.getTrackParticipantId(track) !== input.localParticipantId);

    const featuredTrack = input.featuredParticipantId
      ? visibleTracks.find((track) => input.getTrackParticipantId(track) === input.featuredParticipantId) ?? visibleTracks[0] ?? null
      : visibleTracks[0] ?? null;

    return {
      visibleTracks,
      layoutSnapshot: this.meetingLayoutModelBuilder.build({
        effectiveViewMode: input.effectiveViewMode,
        tracks: visibleTracks,
        featuredTrack,
        screenShareTrack: input.screenShareTrack ?? null,
      }),
    };
  }

  buildSpaceVideoHudSnapshot<TUser>(input: SpaceVideoHudSnapshotInput<TUser>): SpaceVideoHudSnapshotResult<TUser> {
    const orderedUsers = input.orderedUsersInCall.length > 0 ? input.orderedUsersInCall : input.usersInCall;

    return {
      layoutSnapshot: this.spaceVideoHudLayoutModelBuilder.build({
        orderedUsers,
        remoteStreams: input.remoteStreams,
        remoteScreenStreams: input.remoteScreenStreams,
        speakingParticipantIds: input.speakingUsers,
        raisedHandParticipantIds: input.raisedHandParticipantIds,
        distancesByParticipantId: input.userDistances,
        getParticipantId: input.getParticipantId,
        getParticipantCameraEnabled: input.getParticipantCameraEnabled,
      }),
    };
  }
}
