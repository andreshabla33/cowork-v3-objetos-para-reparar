import { useMemo } from 'react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { VisualSnapshotService } from '@/modules/realtime-room';
import type { ViewMode } from '../ViewModeSelector';

interface UseMeetingLayoutSnapshotParams {
  validTracks: TrackReferenceOrPlaceholder[];
  localParticipantIdentity?: string;
  hideSelfView: boolean;
  keepSelfViewVisible: boolean;
  effectiveViewMode: ViewMode;
  speakerIdentity?: string | null;
  screenShareTrack?: TrackReferenceOrPlaceholder;
}

export const useMeetingLayoutSnapshot = ({
  validTracks,
  localParticipantIdentity,
  hideSelfView,
  keepSelfViewVisible,
  effectiveViewMode,
  speakerIdentity,
  screenShareTrack,
}: UseMeetingLayoutSnapshotParams) => {
  const visualSnapshotService = useMemo(() => new VisualSnapshotService(), []);

  const { visibleTracks, layoutSnapshot } = useMemo(
    () => visualSnapshotService.buildMeetingVisualSnapshot({
      tracks: validTracks,
      localParticipantId: localParticipantIdentity,
      hideSelfView,
      keepSelfViewVisible,
      effectiveViewMode,
      featuredParticipantId: speakerIdentity,
      screenShareTrack: screenShareTrack ?? null,
      getTrackParticipantId: (track) => track.participant?.identity,
    }),
    [effectiveViewMode, hideSelfView, keepSelfViewVisible, localParticipantIdentity, screenShareTrack, speakerIdentity, validTracks, visualSnapshotService],
  );

  return {
    visibleTracks,
    layoutSnapshot,
  };
};
