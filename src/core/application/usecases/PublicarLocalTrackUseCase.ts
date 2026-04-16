/**
 * @module application/usecases/PublicarLocalTrackUseCase
 *
 * Publica un track local en una Room de LiveKit aplicando la política de
 * resolución raw → wrapper del port `IVideoTrackPublishResolver` antes del
 * `publishTrack()`.
 *
 * Razón: si existe un `LocalVideoTrack` con `setProcessor()` ya aplicado
 * (preview con blur/virtual-background), publicar el wrapper garantiza
 * que el efecto persista en la publicación. Publicar el raw haría que
 * LiveKit creara un segundo wrapper sin processor → blur invisible hasta
 * ciclar la cámara (ver bugfix de `fix-500-avatars-2026-04-07`).
 *
 * Clean Architecture: capa de Application. Recibe el port por DI; no
 * conoce la implementación del resolver ni el caché de wrappers. Depende
 * de tipos de `livekit-client` porque el dominio real-time del proyecto
 * trata a LiveKit como "lingua franca" (mismo patrón que
 * `GestionarBackgroundVideoUseCase`).
 *
 * @see src/core/domain/ports/IVideoTrackPublishResolver.ts
 * @see https://github.com/livekit/track-processors-js
 */

import type {
  LocalTrackPublication,
  LocalVideoTrack,
  Room,
  TrackPublishOptions,
} from 'livekit-client';
import type {
  IVideoTrackPublishResolver,
  VideoPublishSource,
} from '../../domain/ports/IVideoTrackPublishResolver';

export interface PublicarLocalTrackParams {
  room: Room;
  track: MediaStreamTrack | LocalVideoTrack;
  source: VideoPublishSource;
  publishOptions?: TrackPublishOptions;
}

export class PublicarLocalTrackUseCase {
  constructor(private readonly resolver: IVideoTrackPublishResolver) {}

  async ejecutar(params: PublicarLocalTrackParams): Promise<LocalTrackPublication> {
    const trackToPublish = this.resolver.resolveForPublish(params.track, params.source);
    return params.room.localParticipant.publishTrack(trackToPublish, params.publishOptions);
  }
}
