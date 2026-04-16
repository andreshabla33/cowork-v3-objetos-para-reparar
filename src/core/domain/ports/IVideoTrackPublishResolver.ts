/**
 * @module domain/ports/IVideoTrackPublishResolver
 *
 * Puerto de dominio que define cómo resolver qué objeto de track pasar
 * a `LocalParticipant.publishTrack()` cuando el caller dispone tanto del
 * `MediaStreamTrack` crudo como de un `LocalVideoTrack` wrapper con un
 * `BackgroundProcessor` ya adjunto.
 *
 * La capa de Infraestructura implementa este puerto (ver
 * `LocalVideoTrackFactory`) consultando su caché de wrappers. La capa de
 * Application lo consume sin conocer el mecanismo de caché.
 *
 * @see https://github.com/livekit/track-processors-js
 */

import type { LocalVideoTrack } from 'livekit-client';

/** Fuente del track publicado — alineado con LiveKit `Track.Source`. */
export type VideoPublishSource = 'camera' | 'microphone' | 'screen_share';

export interface IVideoTrackPublishResolver {
  /**
   * Devuelve el objeto a publicar: el `LocalVideoTrack` wrapper existente
   * para ese raw si lo hay (solo aplica a `camera`), o el track recibido
   * tal cual.
   */
  resolveForPublish<T extends MediaStreamTrack | LocalVideoTrack>(
    track: T,
    source: VideoPublishSource,
  ): T | LocalVideoTrack;
}
