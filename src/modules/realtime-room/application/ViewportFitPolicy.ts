import type { LayoutMode } from '../domain/types';

export type VisualLayoutMode = Extract<LayoutMode, 'gallery' | 'speaker' | 'sidebar'>;

export interface ViewportFitInput {
  requestedMode: VisualLayoutMode;
  participantCount: number;
  hasScreenShare: boolean;
  hasPinnedParticipant: boolean;
}

export class ViewportFitPolicy {
  resolveMode(input: ViewportFitInput): VisualLayoutMode {
    if (input.hasPinnedParticipant && !input.hasScreenShare) {
      return 'speaker';
    }

    if (input.requestedMode === 'sidebar' && !input.hasScreenShare) {
      return input.hasPinnedParticipant ? 'speaker' : 'gallery';
    }

    if (input.requestedMode === 'speaker' && input.participantCount < 2 && !input.hasPinnedParticipant) {
      return 'gallery';
    }

    return input.requestedMode;
  }
}
