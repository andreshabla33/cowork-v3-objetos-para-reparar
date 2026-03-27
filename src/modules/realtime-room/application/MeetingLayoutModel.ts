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
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-1';
  if (count === 3) return 'grid-cols-2 grid-rows-2 lg:grid-cols-3 lg:grid-rows-1';
  if (count === 4) return 'grid-cols-2 grid-rows-2';
  if (count <= 6) return 'grid-cols-2 grid-rows-3 lg:grid-cols-3 lg:grid-rows-2';
  if (count <= 8) return 'grid-cols-2 grid-rows-4 sm:grid-cols-6 sm:grid-rows-3';
  if (count <= 9) return 'grid-cols-2 grid-rows-[repeat(5,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-3';
  if (count <= 12) return 'grid-cols-2 grid-rows-[repeat(6,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-4 xl:grid-cols-4 xl:grid-rows-3';
  if (count <= 16) return 'grid-cols-2 grid-rows-[repeat(8,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-[repeat(6,minmax(0,1fr))] xl:grid-cols-4 xl:grid-rows-4';
  if (count <= 20) return 'grid-cols-2 grid-rows-[repeat(10,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-[repeat(7,minmax(0,1fr))] xl:grid-cols-5 xl:grid-rows-4';
  return 'grid-cols-2 grid-rows-[repeat(13,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-9 xl:grid-cols-5 xl:grid-rows-5';
};

const getGalleryViewportClass = (count: number): string => {
  if (count <= 1) {
    return 'relative h-full w-full overflow-hidden p-2 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:p-4 md:pb-24 lg:pb-20';
  }

  return 'relative h-full w-full overflow-hidden p-2 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:p-4 md:pb-24 lg:pb-20';
};

const getGalleryTileClassFactory = (count: number) => (index: number): string => {
  const baseClass = 'rounded-2xl overflow-hidden bg-zinc-900 h-full min-h-0 w-full aspect-[4/3] sm:aspect-[5/4] md:aspect-auto';

  if (count === 1) {
    return `${baseClass}`;
  }

  if (count === 2) {
    return baseClass;
  }

  if (count === 3 && index === count - 1) {
    return `${baseClass} col-span-2 lg:col-span-1`;
  }

  if (count === 5) {
    if (index === count - 1) {
      return `${baseClass} col-span-2 lg:col-span-3`;
    }
    if (index < 3) {
      return `${baseClass} lg:col-span-2`;
    }
    return `${baseClass} lg:col-span-3`;
  }

  if (count === 7) {
    if (index === count - 1) {
      return `${baseClass} sm:col-span-2 sm:col-start-3`;
    }

    return `${baseClass} sm:col-span-2`;
  }

  if (count === 8) {
    if (index >= 6) {
      return `${baseClass} sm:col-span-3`;
    }

    return `${baseClass} sm:col-span-2`;
  }

  if (count === 10) {
    if (index >= 8) {
      return `${baseClass} xl:col-span-2`;
    }

    return baseClass;
  }

  if (count <= 25) {
    return baseClass;
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
