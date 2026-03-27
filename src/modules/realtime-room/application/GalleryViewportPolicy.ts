export type GalleryViewportTier = 'mobile' | 'tablet' | 'laptop' | 'desktop' | 'wide' | 'ultra';

export interface GalleryViewportPolicyInput {
  participantCount: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface GalleryViewportCapacityDecision {
  tier: GalleryViewportTier;
  maxTilesPerPage: number;
  maxColumns: number;
  minTileWidth: number;
  reservedHeightPx: number;
  effectivePageSize: number;
}

interface GalleryViewportTierPreset {
  tier: GalleryViewportTier;
  maxTilesPerPage: number;
  maxColumns: number;
  minTileWidth: number;
  reservedHeightPx: number;
  fallbackPageSize: number;
}

const GALLERY_TILE_ASPECT_RATIO = 4 / 3;
const GALLERY_GAP_PX = 12;
const GALLERY_HORIZONTAL_PADDING_PX = 40;

export class GalleryViewportPolicy {
  resolveCapacity(input: GalleryViewportPolicyInput): GalleryViewportCapacityDecision {
    const preset = this.resolveTierPreset(input.viewportWidth);

    if (input.participantCount <= 1) {
      return {
        ...preset,
        effectivePageSize: 1,
      };
    }

    const availableWidth = Math.max(280, input.viewportWidth - GALLERY_HORIZONTAL_PADDING_PX);
    const availableHeight = Math.max(220, input.viewportHeight - preset.reservedHeightPx);
    const maxColumns = Math.min(preset.maxColumns, preset.maxTilesPerPage, input.participantCount);
    let bestSlots = 1;

    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const tileWidth = (availableWidth - GALLERY_GAP_PX * (columns - 1)) / columns;
      const tileHeight = tileWidth / GALLERY_TILE_ASPECT_RATIO;

      if (tileWidth < preset.minTileWidth) {
        continue;
      }

      const rows = Math.max(1, Math.floor((availableHeight + GALLERY_GAP_PX) / (tileHeight + GALLERY_GAP_PX)));
      const slots = Math.min(input.participantCount, rows * columns, preset.maxTilesPerPage);
      bestSlots = Math.max(bestSlots, slots);
    }

    if (bestSlots === 1 && input.participantCount > 1) {
      bestSlots = Math.min(input.participantCount, preset.fallbackPageSize, preset.maxTilesPerPage);
    }

    return {
      ...preset,
      effectivePageSize: Math.max(1, bestSlots),
    };
  }

  private resolveTierPreset(viewportWidth: number): GalleryViewportTierPreset {
    if (viewportWidth < 640) {
      return {
        tier: 'mobile',
        maxTilesPerPage: 4,
        maxColumns: 2,
        minTileWidth: 140,
        reservedHeightPx: 250,
        fallbackPageSize: 4,
      };
    }

    if (viewportWidth < 960) {
      return {
        tier: 'tablet',
        maxTilesPerPage: 6,
        maxColumns: 3,
        minTileWidth: 165,
        reservedHeightPx: 240,
        fallbackPageSize: 6,
      };
    }

    if (viewportWidth < 1280) {
      return {
        tier: 'laptop',
        maxTilesPerPage: 9,
        maxColumns: 3,
        minTileWidth: 190,
        reservedHeightPx: 230,
        fallbackPageSize: 9,
      };
    }

    if (viewportWidth < 1680) {
      return {
        tier: 'desktop',
        maxTilesPerPage: 12,
        maxColumns: 4,
        minTileWidth: 205,
        reservedHeightPx: 225,
        fallbackPageSize: 12,
      };
    }

    if (viewportWidth < 2200) {
      return {
        tier: 'wide',
        maxTilesPerPage: 16,
        maxColumns: 4,
        minTileWidth: 210,
        reservedHeightPx: 220,
        fallbackPageSize: 16,
      };
    }

    return {
      tier: 'ultra',
      maxTilesPerPage: 25,
      maxColumns: 5,
      minTileWidth: 210,
      reservedHeightPx: 220,
      fallbackPageSize: 25,
    };
  }
}