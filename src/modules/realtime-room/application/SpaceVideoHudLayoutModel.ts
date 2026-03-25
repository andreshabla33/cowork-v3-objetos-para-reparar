export interface SpaceVideoHudLayoutModelInput<TUser> {
  orderedUsers: TUser[];
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  speakingParticipantIds?: Set<string>;
  raisedHandParticipantIds?: Set<string>;
  distancesByParticipantId?: Map<string, number>;
  getParticipantId: (user: TUser) => string;
  getParticipantCameraEnabled?: (user: TUser) => boolean;
}

export interface SpaceVideoHudRemoteCameraTile<TUser> {
  participantId: string;
  user: TUser;
  videoStream: MediaStream | null;
  isSpeaking: boolean;
  distance: number;
  hasVideoStream: boolean;
  shouldShowCamera: boolean;
  isHandRaised: boolean;
}

export interface SpaceVideoHudRemoteScreenShareTile<TUser> {
  participantId: string;
  user: TUser;
  screenStream: MediaStream;
  cameraStream: MediaStream | null;
  hasCameraPreview: boolean;
  isHandRaised: boolean;
}

export interface SpaceVideoHudLayoutModel<TUser> {
  orderedUsers: TUser[];
  usersById: Map<string, TUser>;
  remoteVideoStreamsById: Map<string, MediaStream>;
  remoteScreenStreamsById: Map<string, MediaStream>;
  remoteCameraTiles: SpaceVideoHudRemoteCameraTile<TUser>[];
  remoteScreenShareTiles: SpaceVideoHudRemoteScreenShareTile<TUser>[];
}

export class SpaceVideoHudLayoutModelBuilder {
  build<TUser>(input: SpaceVideoHudLayoutModelInput<TUser>): SpaceVideoHudLayoutModel<TUser> {
    const usersById = new Map<string, TUser>();
    const remoteCameraTiles: SpaceVideoHudRemoteCameraTile<TUser>[] = [];
    const remoteScreenShareTiles: SpaceVideoHudRemoteScreenShareTile<TUser>[] = [];

    input.orderedUsers.forEach((user) => {
      const participantId = input.getParticipantId(user);
      if (!participantId) {
        return;
      }

      usersById.set(participantId, user);
      const videoStream = input.remoteStreams.get(participantId) ?? null;
      const screenStream = input.remoteScreenStreams.get(participantId) ?? null;
      const hasScreenShare = Boolean(screenStream?.getVideoTracks().length);
      const hasVideoStream = Boolean(videoStream?.getVideoTracks().length);
      const shouldShowCamera = Boolean(input.getParticipantCameraEnabled?.(user)) || hasVideoStream;
      const isSpeaking = input.speakingParticipantIds?.has(participantId) ?? false;
      const isHandRaised = input.raisedHandParticipantIds?.has(participantId) ?? false;
      const distance = input.distancesByParticipantId?.get(participantId) ?? 100;

      if (hasScreenShare && screenStream) {
        remoteScreenShareTiles.push({
          participantId,
          user,
          screenStream,
          cameraStream: hasVideoStream ? videoStream : null,
          hasCameraPreview: Boolean(videoStream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live')),
          isHandRaised,
        });
        return;
      }

      remoteCameraTiles.push({
        participantId,
        user,
        videoStream,
        isSpeaking,
        distance,
        hasVideoStream,
        shouldShowCamera,
        isHandRaised,
      });
    });

    return {
      orderedUsers: input.orderedUsers,
      usersById,
      remoteVideoStreamsById: input.remoteStreams,
      remoteScreenStreamsById: input.remoteScreenStreams,
      remoteCameraTiles,
      remoteScreenShareTiles,
    };
  }
}
