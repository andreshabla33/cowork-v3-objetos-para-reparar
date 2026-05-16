/**
 * @module domain/ports/IVideoTrackPublishResolver
 *
 * Puerto de dominio que define cómo resolver qué objeto de track pasar
 * al publisher cuando el caller dispone tanto del `MediaStreamTrack`
 * crudo como de un `VideoTrackHandle` con un processor ya adjunto.
 *
 * La capa de Infrastructure implementa este puerto (ver
 * `LocalVideoTrackFactory`) consultando su registry de handles. La capa
 * de Application lo consume sin conocer el SDK de transport.
 *
 * Refactor 2026-05-16 (Fase 0.1 monorepo): reemplazado `LocalVideoTrack`
 * (livekit-client) por `VideoTrackHandle` (domain/types/media) para
 * eliminar el leak de Infrastructure → Domain.
 *
 * @see https://github.com/livekit/track-processors-js
 */

import type { VideoTrackHandle } from '../types/media';

/** Fuente del track publicado — alineado con LiveKit `Track.Source`. */
export type VideoPublishSource = 'camera' | 'microphone' | 'screen_share';

export interface IVideoTrackPublishResolver {
  /**
   * Devuelve el objeto a publicar: el `VideoTrackHandle` existente para
   * ese raw track si lo hay (solo aplica a `camera`), o el track recibido
   * tal cual.
   */
  resolveForPublish<T extends MediaStreamTrack | VideoTrackHandle>(
    track: T,
    source: VideoPublishSource,
  ): T | VideoTrackHandle;
}
