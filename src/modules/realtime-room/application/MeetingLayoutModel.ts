import type { LayoutMode } from '../domain/types';
import type { VisualLayoutMode } from './ViewportFitPolicy';

export interface MeetingLayoutModelInput<TTrack> {
  effectiveViewMode: VisualLayoutMode;
  tracks: TTrack[];
  featuredTrack?: TTrack | null;
  screenShareTrack?: TTrack | null;
}

export type MeetingLayoutTemplate = Extract<LayoutMode, 'gallery' | 'speaker' | 'sidebar'> | 'screen-share-top';

export interface MeetingGalleryLayoutConfig {
  viewportClassName: string;
  gridClassName: string;
  getTileClassName: (index: number) => string;
}

export interface MeetingLayoutModel<TTrack> {
  template: MeetingLayoutTemplate;
  featuredTrack: TTrack | null;
  stripTracks: TTrack[];
  galleryTracks: TTrack[];
  screenShareTrack: TTrack | null;
  gallery?: MeetingGalleryLayoutConfig;
}

const getGalleryGridClass = (count: number): string => {
  if (count <= 1) return 'grid-cols-1 grid-rows-1 max-w-5xl mx-auto';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-1 max-w-6xl mx-auto';
  if (count === 3) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 max-w-6xl mx-auto';
  if (count === 4) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 max-w-6xl mx-auto';
  if (count === 5) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 lg:grid-rows-2 max-w-7xl mx-auto';
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-[minmax(11rem,1fr)] xl:grid-rows-2';
  if (count <= 9) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 auto-rows-[minmax(11rem,1fr)]';
  if (count <= 12) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 auto-rows-[minmax(11rem,1fr)]';
  return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 auto-rows-[minmax(11rem,1fr)]';
};

const getGalleryViewportClass = (count: number): string => {
  if (count <= 9) {
    return 'relative h-full w-full overflow-hidden p-2.5 pb-28 md:pb-4';
  }

  return 'relative h-full w-full overflow-hidden p-2.5 pb-28 md:pb-4';
};

const getGalleryTileClassFactory = (count: number) => (index: number): string => {
  const baseClass = 'rounded-2xl overflow-hidden bg-zinc-900 min-h-[11rem] w-full aspect-[4/3] md:min-h-0 md:h-full md:aspect-auto';
  const squareClass = 'rounded-2xl overflow-hidden bg-zinc-900 min-h-[11rem] w-full aspect-[4/3] md:min-h-0 md:aspect-[5/4]';

  if (count === 1) {
    return `${baseClass} max-w-5xl justify-self-center md:aspect-auto`;
  }

  if (count === 2) {
    return `${squareClass} max-w-[min(100%,34rem)] justify-self-center`;
  }

  if (count === 4) {
    return `${squareClass} max-w-[min(100%,28rem)] justify-self-center`;
  }

  if (count === 3 && index === count - 1) {
    return `${squareClass} md:col-span-2 md:w-[min(100%,32rem)] md:justify-self-center`;
  }

  if (count === 5) {
    if (index < 3) return `${baseClass} col-span-2`;
    return `${baseClass} col-span-3`;
  }

  if (count <= 9) {
    return `${baseClass} max-w-[min(100%,24rem)] justify-self-center`;
  }

  return baseClass;
};

export class MeetingLayoutModelBuilder {
  build<TTrack>(input: MeetingLayoutModelInput<TTrack>): MeetingLayoutModel<TTrack> {
    const featuredTrack = input.featuredTrack ?? null;
    const screenShareTrack = input.screenShareTrack ?? null;
    const tracks = input.tracks;

    if (screenShareTrack && input.effectiveViewMode === 'sidebar') {
      return {
        template: 'sidebar',
        featuredTrack,
        stripTracks: tracks,
        galleryTracks: [],
        screenShareTrack,
      };
    }

    if (screenShareTrack) {
      return {
        template: 'screen-share-top',
        featuredTrack,
        stripTracks: tracks,
        galleryTracks: [],
        screenShareTrack,
      };
    }

    if (input.effectiveViewMode === 'speaker' && featuredTrack && tracks.length > 1) {
      return {
        template: 'speaker',
        featuredTrack,
        stripTracks: tracks.filter((track) => track !== featuredTrack),
        galleryTracks: [],
        screenShareTrack: null,
      };
    }

    return {
      template: 'gallery',
      featuredTrack,
      stripTracks: [],
      galleryTracks: tracks,
      screenShareTrack: null,
      gallery: {
        viewportClassName: getGalleryViewportClass(tracks.length),
        gridClassName: getGalleryGridClass(tracks.length),
        getTileClassName: getGalleryTileClassFactory(tracks.length),
      },
    };
  }
}
