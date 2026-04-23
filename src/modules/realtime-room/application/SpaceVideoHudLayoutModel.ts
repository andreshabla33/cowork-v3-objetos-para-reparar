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
      // Fuente de verdad para render: transport (LiveKit), no Presence.
      // Antes: `presenceCameraEnabled || hasVideoStream` → cuando el peer apaga
      // cámara, LiveKit saca el stream al instante pero Supabase Presence
      // tarda ~1–3s en propagar `isCameraOn=false` → la burbuja quedaba
      // colgada en "Conectando..." durante ese lag (bug 2026-04-23).
      // Ahora: confiamos en el stream real. Si hay stream → video; si no →
      // avatar/foto. Trade-off: al bootstrap, <2s sin "Conectando..." para
      // newcomers — aceptable vs el bug inverso que confunde más.
      const shouldShowCamera = hasVideoStream;
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

    // Orden estable por participantId — evita que las burbujas del HUD salten
    // al cambiar el active speaker o la distancia. El highlight de quien habla
    // se mantiene vía `isSpeaking` (borde verde), sin reordenar el layout.
    remoteCameraTiles.sort((a, b) => a.participantId.localeCompare(b.participantId));
    remoteScreenShareTiles.sort((a, b) => a.participantId.localeCompare(b.participantId));

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
