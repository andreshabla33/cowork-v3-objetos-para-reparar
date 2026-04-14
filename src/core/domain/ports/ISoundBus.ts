/**
 * @module domain/ports/ISoundBus
 *
 * Puerto (abstracción de Domain) para reproducir efectos de sonido del
 * espacio 3D (wave, nudge, invite, teleport, object_interaction).
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Domain
 * ════════════════════════════════════════════════════════════════
 *
 * La Presentation y los Use Cases NO deben importar las funciones
 * `playWaveSound`, `playObjectInteractionSound`, etc. directamente.
 * En su lugar consumen este port vía el `ApplicationServicesContainer`.
 *
 * El adapter (`WebAudioSoundAdapter`) delega en las funciones globales
 * existentes para no romper consumidores legacy; los nuevos consumidores
 * pasan por aquí.
 */

/** Catálogo cerrado de clips de sonido del espacio 3D. */
export type SoundClipId =
  | 'wave'
  | 'nudge'
  | 'invite'
  | 'teleport'
  | 'object_interaction';

/** Opciones de reproducción espacial (si el clip lo soporta). */
export interface PlaySoundOptions {
  /**
   * Posición en coordenadas mundo para paneo espacial. Si se omite,
   * el sonido se reproduce en 2D a volumen plano (default del adapter).
   */
  posicion?: { x: number; y?: number; z: number };
  /** Volumen entre 0 y 1. Default: lo decide el adapter. */
  volumen?: number;
}

export interface ISoundBus {
  /**
   * Reproduce un clip de sonido. Fire-and-forget. Si el navegador aún
   * no ha recibido un user gesture, el adapter puede ignorar la llamada
   * silenciosamente (política de autoplay).
   */
  play(clip: SoundClipId, opciones?: PlaySoundOptions): void;
}
