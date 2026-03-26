export type TrackPublicationSource = 'camera' | 'microphone' | 'screen_share';
export type TrackPublicationAction = 'publish_or_replace' | 'unpublish' | 'noop';

export interface TrackPublicationPlanItem {
  source: TrackPublicationSource;
  action: TrackPublicationAction;
  track: MediaStreamTrack | null;
  targetTrackEnabled?: boolean;
}

export interface TrackPublicationPlan {
  items: TrackPublicationPlanItem[];
}

export interface TrackPublicationCoordinatorInput {
  desiredMicrophoneEnabled: boolean;
  desiredCameraEnabled: boolean;
  desiredScreenShareEnabled: boolean;
  microphoneTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
  screenShareTrack: MediaStreamTrack | null;
  publishedTrackIds: Partial<Record<TrackPublicationSource, string | null>>;
}

export class TrackPublicationCoordinator {
  buildSyncPlan(input: TrackPublicationCoordinatorInput): TrackPublicationPlan {
    return {
      items: [
        this.buildMicrophonePlan(input),
        this.buildCameraPlan(input),
        this.buildScreenSharePlan(input),
      ],
    };
  }

  private buildMicrophonePlan(input: TrackPublicationCoordinatorInput): TrackPublicationPlanItem {
    const track = input.microphoneTrack;
    const publishedTrackId = input.publishedTrackIds.microphone ?? null;

    if (!track) {
      return {
        source: 'microphone',
        action: publishedTrackId ? 'unpublish' : 'noop',
        track: null,
      };
    }

    return {
      source: 'microphone',
      action: publishedTrackId === track.id ? 'noop' : 'publish_or_replace',
      track,
      targetTrackEnabled: input.desiredMicrophoneEnabled,
    };
  }

  private buildCameraPlan(input: TrackPublicationCoordinatorInput): TrackPublicationPlanItem {
    return this.buildVisualPlan('camera', input.desiredCameraEnabled, input.cameraTrack, input.publishedTrackIds.camera ?? null);
  }

  private buildScreenSharePlan(input: TrackPublicationCoordinatorInput): TrackPublicationPlanItem {
    return this.buildVisualPlan('screen_share', input.desiredScreenShareEnabled, input.screenShareTrack, input.publishedTrackIds.screen_share ?? null);
  }

  private buildVisualPlan(
    source: 'camera' | 'screen_share',
    desiredEnabled: boolean,
    track: MediaStreamTrack | null,
    publishedTrackId: string | null,
  ): TrackPublicationPlanItem {
    if (!desiredEnabled || !track) {
      return {
        source,
        action: publishedTrackId ? 'unpublish' : 'noop',
        track: null,
      };
    }

    return {
      source,
      action: publishedTrackId === track.id ? 'noop' : 'publish_or_replace',
      track,
    };
  }
}
