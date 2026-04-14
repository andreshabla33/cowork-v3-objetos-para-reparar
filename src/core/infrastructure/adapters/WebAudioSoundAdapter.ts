/**
 * @module infrastructure/adapters/WebAudioSoundAdapter
 *
 * Adapter que implementa `ISoundBus` delegando en las funciones globales
 * `playWaveSound` / `playNudgeSound` / ... definidas en
 * `components/space3d/shared.ts`, que a su vez usan `audioManager`.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Infrastructure
 * ════════════════════════════════════════════════════════════════
 *
 * No duplica el audio pipeline: solo traduce el contrato neutral del
 * port a las firmas concretas de cada helper. Esto permite introducir
 * el port en la Application y Presentation sin romper los 8 consumidores
 * legacy que siguen llamando a los helpers globales.
 *
 * Migración gradual: nuevos consumidores deben pasar por este adapter
 * vía `ApplicationServicesContainer.sounds`.
 */

import {
  playWaveSound,
  playNudgeSound,
  playInviteSound,
  playTeleportSound,
  playObjectInteractionSound,
} from '@/components/space3d/shared';
import type {
  ISoundBus,
  PlaySoundOptions,
  SoundClipId,
} from '../../domain/ports/ISoundBus';

export class WebAudioSoundAdapter implements ISoundBus {
  play(clip: SoundClipId, opciones?: PlaySoundOptions): void {
    switch (clip) {
      case 'wave':
        playWaveSound();
        return;
      case 'nudge':
        playNudgeSound();
        return;
      case 'invite':
        playInviteSound();
        return;
      case 'teleport':
        // Único clip con soporte de posición espacial en el audioManager.
        // `PosicionAudio3D` solo admite (x, z) — el pipeline WebAudio es 2D
        // para este juego. Descartamos `y` silenciosamente.
        playTeleportSound(
          opciones?.posicion
            ? {
                position: {
                  x: opciones.posicion.x,
                  z: opciones.posicion.z,
                },
              }
            : undefined,
        );
        return;
      case 'object_interaction':
        playObjectInteractionSound();
        return;
      default:
        // Catálogo cerrado en TS — no debería alcanzarse.
        return;
    }
  }
}
