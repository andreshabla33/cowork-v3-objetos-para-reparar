/**
 * @module application/usecases/GestionarBackgroundVideoUseCase
 *
 * Use Case de aplicación que encapsula el ciclo de vida completo del
 * background processor siguiendo el patrón oficial de LiveKit.
 *
 * ════════════════════════════════════════════════════════════════
 * CICLO DE VIDA (patrón oficial LiveKit)
 * ════════════════════════════════════════════════════════════════
 *
 *   attachToTrack(track)   → setProcessor(disabled) [una sola vez]
 *   setEffect(track, cfg)  → switchTo(blur | virtual-background)
 *   disableEffect(track)   → switchTo(disabled) — processor vivo, sin efecto
 *   detachFromTrack(track) → stopProcessor() [cleanup final, unmount]
 *
 * La capa de presentación (VideoWithBackground, useBackgroundProcessor)
 * no conoce detalles del SDK de LiveKit: solo orquesta a través de este
 * Use Case, manteniendo el desacoplamiento de Clean Architecture.
 *
 * ════════════════════════════════════════════════════════════════
 * GARANTÍAS
 * ════════════════════════════════════════════════════════════════
 *  - El WASM de MediaPipe/segmentación se inicializa 1 sola vez por track
 *  - Los cambios de efecto son hot-swaps O(1) sin re-init de GPU
 *  - Desactivar el efecto NO destruye el processor → reactivar es instantáneo
 *  - stopProcessor() solo ocurre en detachFromTrack (unmount definitivo)
 *
 * @see src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter.ts
 * @see https://github.com/livekit/track-processors-js (patrón disabled → switchTo)
 */

import type { LocalVideoTrack } from 'livekit-client';
import type { LiveKitOfficialBackgroundAdapter } from '../../infrastructure/adapters/LiveKitOfficialBackgroundAdapter';
import type { VideoTrackProcessorConfig } from '../../domain/ports/IVideoTrackProcessor';
import { getBackgroundCapability } from '../../infrastructure/browser/BackgroundCapabilityDetector';
import { logger } from '@/lib/logger';

const log = logger.child('GestionarBackgroundVideoUseCase');

export class GestionarBackgroundVideoUseCase {
  constructor(
    private readonly adapter: LiveKitOfficialBackgroundAdapter,
  ) {}

  /**
   * Inicializa el processor en passthrough y lo adjunta al track.
   * Debe llamarse una sola vez cuando el track está disponible.
   *
   * Si el browser no soporta background processors, retorna silenciosamente.
   */
  async attachToTrack(track: LocalVideoTrack): Promise<void> {
    const capability = getBackgroundCapability();
    if (!capability.supported) {
      log.debug('attachToTrack: browser no soportado, skip', {
        level: capability.level,
      });
      return;
    }

    await this.adapter.attachProcessor(track);
  }

  /**
   * Activa o cambia el efecto de fondo.
   * Si el processor no está adjunto aún, lo adjunta implícitamente.
   *
   * @param track  LocalVideoTrack (preview o publicado)
   * @param config Configuración del efecto
   */
  async setEffect(
    track: LocalVideoTrack,
    config: VideoTrackProcessorConfig,
  ): Promise<void> {
    const capability = getBackgroundCapability();
    if (!capability.supported) return;

    if (config.effectType === 'none') {
      await this.adapter.disableEffect(track);
      return;
    }

    await this.adapter.setEffect(track, config);

    log.info('setEffect: efecto aplicado', {
      effectType: config.effectType,
      offMainThread: capability.offMainThread,
    });
  }

  /**
   * Desactiva el efecto sin destruir el processor.
   * El pipeline WebGL permanece vivo en passthrough.
   * Reactivar con setEffect() es instantáneo (solo switchTo).
   */
  async disableEffect(track: LocalVideoTrack): Promise<void> {
    await this.adapter.disableEffect(track);
  }

  /**
   * Limpieza final — libera WASM, WebGL y todos los recursos del processor.
   * Debe llamarse SOLO en el unmount definitivo del componente o track.
   * Después de este punto, attachToTrack() requeriría un nuevo init de WASM.
   */
  async detachFromTrack(track: LocalVideoTrack): Promise<void> {
    await this.adapter.detachProcessor(track);
  }

  /**
   * Retorna si el browser soporta background processing.
   * Útil para la capa de presentación para decidir si mostrar opciones de fondo.
   */
  isSupported(): boolean {
    return getBackgroundCapability().supported;
  }

  /**
   * Retorna si el procesamiento ocurrirá off-main-thread (Chrome 94+).
   * Off-main-thread: no compite con Three.js / React render en el main thread.
   */
  isOffMainThread(): boolean {
    return getBackgroundCapability().offMainThread;
  }
}
