/**
 * @module application/usecases/PublicarLocalTrackUseCase
 *
 * Publica un track local en una Room realtime aplicando la política de
 * resolución raw → handle del port `IVideoTrackPublishResolver` antes
 * de llamar al `IRealtimeRoomPublisher`.
 *
 * Razón: si existe un `VideoTrackHandle` con processor adjunto (preview
 * con blur/virtual-background), publicar el handle garantiza que el
 * efecto persista en la publicación. Publicar el raw haría que el adapter
 * crease un segundo wrapper sin processor → blur invisible hasta ciclar
 * la cámara (bugfix `fix-500-avatars-2026-04-07`).
 *
 * Clean Architecture: capa de Application. Depende solo de ports (Domain).
 * No conoce el SDK de transport — el adapter LiveKit implementa los ports
 * y resuelve los handles internamente.
 *
 * Refactor 2026-05-16 (Fase 0.1 monorepo): elimina imports de
 * `livekit-client` (Room, LocalVideoTrack, LocalTrackPublication,
 * TrackPublishOptions) reemplazándolos por `VideoTrackHandle`,
 * `PublishedTrackHandle`, `RealtimePublishOptions` e `IRealtimeRoomPublisher`.
 *
 * @see src/core/domain/ports/IVideoTrackPublishResolver.ts
 * @see src/core/domain/ports/IRealtimeRoomPublisher.ts
 * @see https://github.com/livekit/track-processors-js
 */

import type { IRealtimeRoomPublisher } from '../../domain/ports/IRealtimeRoomPublisher';
import type {
  IVideoTrackPublishResolver,
  VideoPublishSource,
} from '../../domain/ports/IVideoTrackPublishResolver';
import type {
  PublishedTrackHandle,
  RealtimePublishOptions,
  VideoTrackHandle,
} from '../../domain/types/media';

export interface PublicarLocalTrackParams {
  publisher: IRealtimeRoomPublisher;
  track: MediaStreamTrack | VideoTrackHandle;
  source: VideoPublishSource;
  publishOptions?: RealtimePublishOptions;
}

export class PublicarLocalTrackUseCase {
  constructor(private readonly resolver: IVideoTrackPublishResolver) {}

  async ejecutar(params: PublicarLocalTrackParams): Promise<PublishedTrackHandle> {
    const trackToPublish = this.resolver.resolveForPublish(params.track, params.source);
    return params.publisher.publishTrack(trackToPublish, params.publishOptions);
  }
}
