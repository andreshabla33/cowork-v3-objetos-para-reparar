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

/**
 * Devuelve las clases de grid + alignment para la galería.
 *
 * Para count=1: el tile se centra en el viewport en vez de estirarse
 * al 100% de la pantalla, evitando que el video ocupe toda la vista.
 *
 * Para count>=2: se mantiene el comportamiento de estiramiento (stretch)
 * para rellenar el espacio disponible de forma uniforme.
 */
const getGalleryGridClass = (count: number): string => {
  // ── Alignment base que varía según el count ─────────────────────────────
  const stretch = 'content-stretch items-stretch justify-items-stretch';
  const center = 'place-content-center place-items-center';

  if (count <= 1) return `grid-cols-1 grid-rows-1 ${center}`;
  if (count === 2) return `grid-cols-1 sm:grid-cols-2 sm:grid-rows-1 ${stretch}`;
  if (count === 3) return `grid-cols-2 grid-rows-2 lg:grid-cols-3 lg:grid-rows-1 ${stretch}`;
  if (count === 4) return `grid-cols-2 grid-rows-2 ${stretch}`;
  if (count <= 6) return `grid-cols-2 grid-rows-3 lg:grid-cols-3 lg:grid-rows-2 ${stretch}`;
  if (count <= 8) return `grid-cols-2 grid-rows-4 sm:grid-cols-6 sm:grid-rows-3 ${stretch}`;
  if (count <= 9) return `grid-cols-2 grid-rows-[repeat(5,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-3 ${stretch}`;
  if (count <= 12) return `grid-cols-2 grid-rows-[repeat(6,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-4 xl:grid-cols-4 xl:grid-rows-3 ${stretch}`;
  if (count <= 16) return `grid-cols-2 grid-rows-[repeat(8,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-[repeat(6,minmax(0,1fr))] xl:grid-cols-4 xl:grid-rows-4 ${stretch}`;
  if (count <= 20) return `grid-cols-2 grid-rows-[repeat(10,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-[repeat(7,minmax(0,1fr))] xl:grid-cols-5 xl:grid-rows-4 ${stretch}`;
  return `grid-cols-2 grid-rows-[repeat(13,minmax(0,1fr))] sm:grid-cols-3 sm:grid-rows-9 xl:grid-cols-5 xl:grid-rows-5 ${stretch}`;
};

/**
 * Viewport del grid de galería.
 *
 * El padding superior e inferior para las barras flotantes (ViewModeSelector
 * y control bar) se aplica en el contenedor `meeting-stage` de
 * MeetingRoomContent (pt-14/pb-24). El viewport solo necesita un padding
 * interno ligero para separar tiles del borde.
 */
const getGalleryViewportClass = (count: number): string => {
  if (count <= 1) {
    // 1 participante: h-full hereda el espacio ya restringido por el stage.
    return 'relative h-full w-full overflow-hidden p-2 sm:p-3 md:p-4';
  }

  return 'relative h-full w-full overflow-hidden p-2 sm:p-3 md:p-4';
};

const getGalleryTileClassFactory = (count: number) => (index: number): string => {
  const baseClass = 'rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] h-full min-h-0 w-full aspect-[4/3] sm:aspect-[5/4] md:aspect-auto';

  if (count === 1) {
    // Tile centrado con max-width/max-height para que no desborde el
    // viewport. aspect-video (16:9) mantiene proporción estética y
    // max-h-full impide que supere el espacio disponible del grid.
    return 'rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] w-full max-w-5xl max-h-full aspect-video';
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
