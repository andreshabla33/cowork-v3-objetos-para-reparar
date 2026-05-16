/**
 * @module domain/ports/IRealtimeRoomPublisher
 *
 * Puerto de dominio para publicar tracks locales en una Room realtime.
 * Abstrae `Room.localParticipant.publishTrack` de livekit-client detrás
 * de un contrato agnóstico de transport.
 *
 * Refactor 2026-05-16 (Fase 0.1 monorepo): reemplaza el acoplamiento
 * directo de `PublicarLocalTrackUseCase` con `livekit-client` (`Room`,
 * `LocalTrackPublication`, `TrackPublishOptions`). El adapter
 * `LiveKitRoomPublisherAdapter` mapea entre este puerto y el SDK real.
 */

import type {
  PublishedTrackHandle,
  RealtimePublishOptions,
  VideoTrackHandle,
} from '../types/media';

export interface IRealtimeRoomPublisher {
  /**
   * Publica un track local en la Room. Acepta tanto un `MediaStreamTrack`
   * crudo como un `VideoTrackHandle` (track wrapped por el adapter con
   * processor adjunto).
   */
  publishTrack(
    track: MediaStreamTrack | VideoTrackHandle,
    options?: RealtimePublishOptions,
  ): Promise<PublishedTrackHandle>;
}
