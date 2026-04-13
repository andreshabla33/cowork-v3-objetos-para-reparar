/**
 * @module core/domain/entities/espacio3d/AvatarLabelEntity
 * @description Domain entity for avatar name labels in the 3D space.
 *
 * Clean Architecture: Domain layer — pure data, no Three.js/React dependencies.
 *
 * Represents the data needed to render a single avatar name label.
 * Combines features from both legacy systems:
 *   - AvatarLabels (PR-10): WebGL troika text, batch rendering, distance culling
 *   - Avatar inline label: dynamic Y offset, current user color, status tooltip, click interaction
 *
 * Unified into a single domain entity that the Application layer populates
 * and the Presentation layer renders.
 */

/** Supported presence statuses for label rendering */
export type LabelPresenceStatus = 'available' | 'busy' | 'away' | 'dnd';

/**
 * Pure domain entity representing all data needed to render an avatar label.
 * No rendering logic — only data.
 */
export interface AvatarLabelEntity {
  /** User ID — unique key for this label */
  readonly userId: string;

  /** Display name shown above the avatar */
  readonly name: string;

  /** Presence status (drives status dot color + tooltip text) */
  readonly status: LabelPresenceStatus;

  /** World-space X position of the avatar */
  readonly x: number;

  /** World-space Z position of the avatar */
  readonly z: number;

  /** Height of the avatar model — drives dynamic Y offset for the label */
  readonly avatarHeight: number;

  /** Distance from this avatar to the local camera (for culling + font sizing) */
  readonly distanceToCamera: number;

  /** Whether this is the current (local) user — drives highlight color */
  readonly isCurrentUser: boolean;

  /** Whether the camera is on (labels hidden when video is showing) */
  readonly isCameraOn: boolean;

  /** LOD level — labels not shown for 'low' LOD distant avatars */
  readonly lodLevel: 'high' | 'mid' | 'low';
}

/**
 * Configuration constants for label rendering behavior.
 * Domain-level so they can be shared between Application and Presentation layers.
 */
export const LABEL_CONFIG = {
  /** Max distance beyond which labels are culled */
  CULL_DISTANCE: 40,

  /** Distance threshold for font size quantization (near) */
  FONT_NEAR_THRESHOLD: 18,

  /** Distance threshold for font size quantization (far) */
  FONT_FAR_THRESHOLD: 22,

  /** Near font size */
  FONT_SIZE_NEAR: 0.24,

  /** Far font size */
  FONT_SIZE_FAR: 0.3,

  /** Vertical offset above avatar height */
  LABEL_Y_OFFSET: 0.4,

  /** Status tooltip auto-hide delay in ms */
  STATUS_TOOLTIP_DELAY_MS: 2000,
} as const;
