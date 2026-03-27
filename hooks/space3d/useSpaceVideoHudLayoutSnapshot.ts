import { useMemo } from 'react';
import type { User } from '@/types';
import { VisualSnapshotService } from '@/modules/realtime-room';

interface UseSpaceVideoHudLayoutSnapshotParams {
  usersInCall: User[];
  orderedUsersInCall: User[];
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  speakingUsers: Set<string>;
  raisedHandParticipantIds?: Set<string>;
  userDistances: Map<string, number>;
}

export const useSpaceVideoHudLayoutSnapshot = ({
  usersInCall,
  orderedUsersInCall,
  remoteStreams,
  remoteScreenStreams,
  speakingUsers,
  raisedHandParticipantIds,
  userDistances,
}: UseSpaceVideoHudLayoutSnapshotParams) => {
  const visualSnapshotService = useMemo(() => new VisualSnapshotService(), []);

  const { layoutSnapshot } = useMemo(
    () => visualSnapshotService.buildSpaceVideoHudSnapshot({
      usersInCall,
      orderedUsersInCall,
      remoteStreams,
      remoteScreenStreams,
      speakingUsers,
      raisedHandParticipantIds,
      userDistances,
      getParticipantId: (user) => user.id,
      getParticipantCameraEnabled: (user) => user.isCameraOn,
    }),
    [orderedUsersInCall, raisedHandParticipantIds, remoteScreenStreams, remoteStreams, speakingUsers, userDistances, usersInCall, visualSnapshotService],
  );

  return {
    layoutSnapshot,
  };
};
