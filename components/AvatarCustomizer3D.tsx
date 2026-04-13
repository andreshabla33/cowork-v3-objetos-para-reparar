/**
 * @module components/AvatarCustomizer3D
 * @description Backward-compatible re-export from refactored customizer module.
 * Original 920-line monolith decomposed into customizer/ sub-modules (2026-04-13).
 *
 * Consumers (WorkspaceLayout, VirtualSpace3D) import from this path;
 * this file ensures zero breakage during the migration.
 */

export { AvatarCustomizer3D, AvatarCustomizer3D as default } from './customizer/AvatarCustomizer3D';
