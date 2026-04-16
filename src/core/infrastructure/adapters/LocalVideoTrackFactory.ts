/**
 * @module infrastructure/adapters/LocalVideoTrackFactory
 *
 * Factory de infraestructura para wrapping de MediaStreamTrack → LocalVideoTrack.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Separación de capas
 * ════════════════════════════════════════════════════════════════
 *
 * La capa de Presentación (hooks, componentes) NO debe instanciar
 * clases de infraestructura (LocalVideoTrack de livekit-client).
 * Esta factory centraliza:
 *   1. El wrapping de MediaStreamTrack → LocalVideoTrack
 *   2. La política userProvidedTrack=true (LiveKit no detiene el track subyacente)
 *   3. El caché por trackId para evitar wrappers duplicados bajo Strict Mode
 *
 * ════════════════════════════════════════════════════════════════
 * CACHÉ POR TRACK ID — Garantía de referencia estable
 * ════════════════════════════════════════════════════════════════
 *
 * Bajo React Strict Mode, el effect de previewVideoTrack puede ejecutarse
 * dos veces para el mismo MediaStreamTrack. Sin caché, cada ejecución
 * crearía un nuevo wrapper con un nuevo objeto LocalVideoTrack → el adapter
 * los trataría como tracks distintos → 2 inits de WASM.
 *
 * Con caché: si el rawTrack.id ya tiene un wrapper vivo, se retorna el mismo
 * objeto → el adapter detecta la sesión existente → 0 WASM adicionales.
 *
 * El caché se limpia automáticamente cuando el MediaStreamTrack llega a
 * 'ended' (el browser notifica vía el evento 'ended').
 *
 * @see src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter.ts
 * @see components/meetings/videocall/hooks/useMeetingMediaBridge.ts
 */

import { LocalVideoTrack } from 'livekit-client';
import { logger } from '@/lib/logger';
import type { IVideoTrackPublishResolver, VideoPublishSource } from '../../domain/ports/IVideoTrackPublishResolver';

const log = logger.child('LocalVideoTrackFactory');

// ─── Singleton factory ────────────────────────────────────────────────────────

/**
 * Factory singleton que crea y cachea wrappers LocalVideoTrack para
 * MediaStreamTracks de preview (antes de publicar a la room de LiveKit).
 *
 * La instancia singleton se obtiene via `getLocalVideoTrackFactory()`.
 */
export class LocalVideoTrackFactory implements IVideoTrackPublishResolver {
  /**
   * Caché: mediaStreamTrack.id → LocalVideoTrack wrapper.
   * Solo contiene tracks activos (readyState !== 'ended').
   */
  private cache = new Map<string, LocalVideoTrack>();

  /**
   * Retorna un LocalVideoTrack wrapper para el MediaStreamTrack dado.
   *
   * Si ya existe un wrapper en caché para este trackId, lo retorna
   * directamente (misma referencia de objeto → estabilidad entre renders).
   *
   * Si no existe, crea un nuevo wrapper con userProvidedTrack=true para
   * que LiveKit no detenga el MediaStreamTrack subyacente al cleanup.
   *
   * @param rawTrack MediaStreamTrack activo de la cámara del usuario
   * @returns LocalVideoTrack wrapper estable y cacheado
   */
  wrapRawTrack(rawTrack: MediaStreamTrack): LocalVideoTrack {
    const trackId = rawTrack.id;

    // Retornar wrapper existente si el track sigue activo
    const existing = this.cache.get(trackId);
    if (existing) {
      log.debug('wrapRawTrack: retornando wrapper cacheado', { trackId });
      return existing;
    }

    // Crear nuevo wrapper con userProvidedTrack=true:
    //   - Preserva el MediaStreamTrack subyacente al cleanup del componente
    //   - LiveKit llama stopProcessor() en el wrapper, no .stop() en el track
    const wrapper = new LocalVideoTrack(rawTrack, undefined, true);
    this.cache.set(trackId, wrapper);

    log.debug('wrapRawTrack: nuevo wrapper creado', { trackId });

    // Limpiar caché automáticamente cuando el track termine
    rawTrack.addEventListener('ended', () => {
      this.cache.delete(trackId);
      log.debug('wrapRawTrack: wrapper eliminado del caché (track ended)', { trackId });
    }, { once: true });

    return wrapper;
  }

  /** Lookup read-only del wrapper cacheado. */
  peekWrapper(rawTrackId: string): LocalVideoTrack | null {
    return this.cache.get(rawTrackId) ?? null;
  }

  /**
   * Resuelve el wrapper a publicar. Para cámara delega a `wrapRawTrack`
   * (idempotente: reutiliza el cacheado o crea y cachea uno nuevo).
   *
   * Garantiza Single Source of Truth del `LocalVideoTrack` de cámara sin
   * importar el orden en que corran los useEffects de Presentation
   * (`useLocalCameraTrack`) y Application (`coordinator.publishTrack`):
   * el primero que llegue crea el wrapper, el segundo obtiene la misma
   * referencia. Así LiveKit nunca construye un wrapper interno adicional
   * en `publishTrack(MediaStreamTrack)` y el `setProcessor()` del preview
   * persiste en la publicación.
   *
   * @see https://github.com/livekit/track-processors-js
   */
  resolveForPublish<T extends MediaStreamTrack | LocalVideoTrack>(
    track: T,
    source: VideoPublishSource,
  ): T | LocalVideoTrack {
    if (track instanceof LocalVideoTrack || source !== 'camera') return track;
    return this.wrapRawTrack(track);
  }

  /**
   * Elimina un wrapper del caché de forma explícita.
   * Útil cuando el track es reemplazado por uno nuevo del mismo dispositivo.
   */
  releaseWrapper(rawTrackId: string): void {
    if (this.cache.delete(rawTrackId)) {
      log.debug('wrapRawTrack: wrapper liberado explícitamente', { rawTrackId });
    }
  }

  /**
   * Limpia todo el caché. Llamar en dispose/teardown del hook.
   */
  dispose(): void {
    this.cache.clear();
    log.debug('LocalVideoTrackFactory disposed');
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let factoryInstance: LocalVideoTrackFactory | null = null;

export function getLocalVideoTrackFactory(): LocalVideoTrackFactory {
  if (!factoryInstance) {
    factoryInstance = new LocalVideoTrackFactory();
  }
  return factoryInstance;
}
