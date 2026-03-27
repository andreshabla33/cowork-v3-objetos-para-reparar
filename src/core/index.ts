/**
 * @module core/index
 * Barrel exports para el módulo core con Clean Architecture.
 * 
 * Domain Layer
 */
export type {
  IBackgroundSegmenter,
  SegmenterConfig,
  SegmentationMask,
} from './domain/ports/IBackgroundSegmenter';

export type {
  IBackgroundCompositor,
  CompositorConfig,
  EffectType,
} from './domain/ports/IBackgroundCompositor';

export type {
  IVideoTrackProcessor,
  VideoTrackProcessorConfig,
  ProcessedVideoTrack,
} from './domain/ports/IVideoTrackProcessor';

/**
 * Application Layer
 */
export {
  VideoTrackProcessorService,
  videoTrackProcessor,
} from './application/VideoTrackProcessorService';

/**
 * Infrastructure Layer
 */
export { MediaPipeSegmenterAdapter } from './infrastructure/adapters/MediaPipeSegmenterAdapter';
export { WebGLBackgroundCompositorAdapter } from './infrastructure/adapters/WebGLBackgroundCompositorAdapter';
export { acquireWebGLContext, releaseWebGLContext, isWebGLAvailable } from './infrastructure/browser/WebGLContextManager';
export { acquireSegmenter, releaseSegmenter } from './infrastructure/browser/SegmenterSingleton';

/**
 * Presentation Layer
 */
export { useVideoTrackProcessor, useStableProcessedTrack } from './presentation/hooks/useVideoTrackProcessor';
export { VideoTrackProcessorView, type VideoTrackProcessorViewProps } from './presentation/components/VideoTrackProcessorView';
export type { BackgroundEffectType } from './presentation/hooks/useVideoTrackProcessor';
