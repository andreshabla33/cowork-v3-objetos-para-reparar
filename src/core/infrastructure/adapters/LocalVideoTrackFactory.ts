/**
 * @module infrastructure/adapters/LocalVideoTrackFactory
 *
 * Factory de infraestructura para wrapping de MediaStreamTrack → LocalVideoTrack
 * y bridge con `VideoTrackHandle` (tipo opaco del Domain).
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
 *   4. El registry handleId ↔ LocalVideoTrack (Domain ↔ Infrastructure)
 *
 * Refactor 2026-05-16 (Fase 0.1 monorepo): la factory ahora es también el
 * resolver entre `VideoTrackHandle` (Domain) y `LocalVideoTrack` (livekit-
 * client). Application/Domain pasan handles; el adapter LiveKit consulta
 * `resolveNative(handleId)` para obtener el objeto real del SDK.
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
 * @see src/core/domain/types/media.ts
 */

import { LocalVideoTrack } from 'livekit-client';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  IVideoTrackPublishResolver,
  VideoPublishSource,
} from '../../domain/ports/IVideoTrackPublishResolver';
import type { VideoTrackHandle } from '../../domain/types/media';

const log = logger.child('LocalVideoTrackFactory');

/** Marca interna que reconoce handles emitidos por esta factory. */
const HANDLE_MARK: unique symbol = Symbol('LocalVideoTrackHandle');

interface InternalHandle extends VideoTrackHandle {
  readonly [HANDLE_MARK]: true;
}

function isFactoryHandle(value: unknown): value is InternalHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    HANDLE_MARK in value &&
    (value as InternalHandle)[HANDLE_MARK] === true
  );
}

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
   * Mismo wrapper si ya existe (referencia estable bajo Strict Mode).
   */
  wrapRawTrack(rawTrack: MediaStreamTrack): LocalVideoTrack {
    const trackId = rawTrack.id;

    const existing = this.cache.get(trackId);
    if (existing) {
      log.debug('wrapRawTrack: retornando wrapper cacheado', { trackId });
      return existing;
    }

    // userProvidedTrack=true: LiveKit no detiene el MediaStreamTrack subyacente
    const wrapper = new LocalVideoTrack(rawTrack, undefined, true);
    this.cache.set(trackId, wrapper);

    log.debug('wrapRawTrack: nuevo wrapper creado', { trackId });

    rawTrack.addEventListener('ended', () => {
      this.cache.delete(trackId);
      log.debug('wrapRawTrack: wrapper eliminado del caché (track ended)', { trackId });
    }, { once: true });

    return wrapper;
  }

  /**
   * Crea un `VideoTrackHandle` (Domain) para el `LocalVideoTrack` dado.
   * El handle es estable mientras el wrapper esté en caché.
   *
   * El adapter LiveKit recibe handles desde Application/Domain y los
   * resuelve a `LocalVideoTrack` vía `resolveNative()`.
   */
  handleOf(
    localTrack: LocalVideoTrack,
    kind: 'camera' | 'screen' | 'background',
  ): VideoTrackHandle {
    const id = localTrack.mediaStreamTrack.id;
    // Asegurar que esté en caché (idempotente — wrapRawTrack ya lo hace)
    if (!this.cache.has(id)) {
      this.cache.set(id, localTrack);
    }
    const handle: InternalHandle = {
      id,
      kind,
      [HANDLE_MARK]: true,
    };
    return handle;
  }

  /**
   * Atajo: wrap + handle en una sola llamada para callers que parten
   * de un MediaStreamTrack crudo.
   */
  handleFor(
    rawTrack: MediaStreamTrack,
    kind: 'camera' | 'screen' | 'background',
  ): VideoTrackHandle {
    const wrapper = this.wrapRawTrack(rawTrack);
    return this.handleOf(wrapper, kind);
  }

  /**
   * Resuelve un `VideoTrackHandle` al `LocalVideoTrack` nativo del SDK.
   * Usado por el adapter LiveKit para acceder a métodos del SDK
   * (`setProcessor`, `stopProcessor`, etc.) sin que Application/Domain
   * conozcan el tipo concreto.
   */
  resolveNative(handle: VideoTrackHandle): LocalVideoTrack | null {
    return this.cache.get(handle.id) ?? null;
  }

  /** Lookup read-only del wrapper cacheado (compat). */
  peekWrapper(rawTrackId: string): LocalVideoTrack | null {
    return this.cache.get(rawTrackId) ?? null;
  }

  /**
   * Resuelve el wrapper a publicar. Para cámara delega a `wrapRawTrack`
   * (idempotente: reutiliza el cacheado o crea y cachea uno nuevo).
   *
   * Si recibe un `VideoTrackHandle` emitido por esta factory, devuelve
   * el handle tal cual (el publisher adapter lo resolverá a LocalVideoTrack
   * cuando se necesite el objeto nativo).
   *
   * Garantiza Single Source of Truth del `LocalVideoTrack` de cámara sin
   * importar el orden en que corran los useEffects de Presentation y
   * Application: el primero que llegue crea el wrapper, el segundo
   * obtiene la misma referencia. Así LiveKit nunca construye un wrapper
   * interno adicional en `publishTrack(MediaStreamTrack)` y el
   * `setProcessor()` del preview persiste en la publicación.
   *
   * @see https://github.com/livekit/track-processors-js
   */
  resolveForPublish<T extends MediaStreamTrack | VideoTrackHandle>(
    track: T,
    source: VideoPublishSource,
  ): T | VideoTrackHandle {
    // Handle ya resuelto → pasa tal cual
    if (isFactoryHandle(track)) return track;
    // Solo wrapeamos cámara (mic/screen quedan como MediaStreamTrack)
    if (source !== 'camera') return track;
    // MediaStreamTrack crudo → wrap + handle
    const mediaTrack = track as MediaStreamTrack;
    return this.handleFor(mediaTrack, 'camera');
  }

  /** Elimina un wrapper del caché de forma explícita. */
  releaseWrapper(rawTrackId: string): void {
    if (this.cache.delete(rawTrackId)) {
      log.debug('wrapRawTrack: wrapper liberado explícitamente', { rawTrackId });
    }
  }

  /** Limpia todo el caché. Llamar en dispose/teardown. */
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
