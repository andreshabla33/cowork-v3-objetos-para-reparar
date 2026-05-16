/**
 * @module domain/types/media
 *
 * Tipos opacos para tracks de media usados por Application y Domain.
 *
 * Clean Architecture — Capa de Domain
 *
 * Esta capa NO debe importar tipos concretos de `livekit-client` u otra
 * librería de transport. `VideoTrackHandle` es un handle abstracto que
 * la capa de Infrastructure resuelve a su tipo nativo (LocalVideoTrack
 * en el adapter LiveKit) vía registry. Esto permite que la misma lógica
 * de Application/Domain corra tanto en `apps/cowork-3d` (R3F + LiveKit)
 * como en `apps/cowork-2d` (Phaser + LiveKit) o cualquier otro transport
 * que respete los puertos.
 *
 * Ref: ROADMAP_MONOREPO_PHASER4.md — Fase 0.1.
 */

/**
 * Handle opaco a un track de video local. La capa de Infrastructure
 * resuelve el handle (por `id`) al objeto nativo del SDK (e.g.
 * `LocalVideoTrack` de livekit-client) vía registry.
 *
 * - `id`: identificador del MediaStreamTrack subyacente (estable durante
 *   la vida del track). Generado por el browser; usado como llave en
 *   el registry del adapter.
 * - `kind`: categoría del track desde la perspectiva del dominio.
 *   - `camera`: video de cámara del usuario local.
 *   - `screen`: pantalla compartida.
 *   - `background`: track procesado para preview con efecto de fondo.
 */
export interface VideoTrackHandle {
  readonly id: string;
  readonly kind: 'camera' | 'screen' | 'background';
}

/**
 * Resultado de publicar un track local en la Room realtime.
 * Devuelto por `IRealtimeRoomPublisher.publishTrack`.
 */
export interface PublishedTrackHandle {
  /** SID del track asignado por el SFU al confirmar la publicación. */
  readonly trackSid: string;
  /** Naturaleza del track publicado. */
  readonly trackKind: 'video' | 'audio';
}

/**
 * Opciones agnósticas para publicar un track. Subset alineado con lo
 * que actualmente consumen los use cases — se mantiene mínimo para no
 * acoplar Application a opciones de un SDK específico.
 */
export interface RealtimePublishOptions {
  readonly name?: string;
  readonly source?: 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio';
  readonly simulcast?: boolean;
}
