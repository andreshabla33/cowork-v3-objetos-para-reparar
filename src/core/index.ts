/**
 * @module core/index
 * Barrel exports del módulo core — Clean Architecture.
 *
 * Capas expuestas:
 *   Domain      → Puertos (interfaces y tipos)
 *   Application → Use Cases
 *   Infrastructure → Adaptadores y detectores
 *
 * Background processing migrado al patrón oficial LiveKit keep-alive.
 * Toda la lógica de segmentación delegada a @livekit/track-processors v0.7.x.
 */

// ════════════════════════════════════════════════════════════════
// Domain Layer — Puertos
// ════════════════════════════════════════════════════════════════

export type {
  EffectType,
  IVideoTrackProcessor,
  VideoTrackProcessorConfig,
} from './domain/ports/IVideoTrackProcessor';

// ════════════════════════════════════════════════════════════════
// Application Layer — Use Cases
// ════════════════════════════════════════════════════════════════

export { GestionarBackgroundVideoUseCase } from './application/usecases/GestionarBackgroundVideoUseCase';

// ════════════════════════════════════════════════════════════════
// Infrastructure Layer — Adaptadores y detección de browser
// ════════════════════════════════════════════════════════════════

export {
  LiveKitOfficialBackgroundAdapter,
  getLiveKitBackgroundAdapter,
} from './infrastructure/adapters/LiveKitOfficialBackgroundAdapter';

export {
  getBackgroundCapability,
  detectBackgroundCapability,
  type BackgroundCapability,
  type BackgroundCapabilityLevel,
} from './infrastructure/browser/BackgroundCapabilityDetector';
