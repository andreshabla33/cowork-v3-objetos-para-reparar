/**
 * @module infrastructure/adapters/LiveKitOfficialBackgroundAdapter
 *
 * Adaptador Clean Architecture que encapsula `@livekit/track-processors` v0.7.2
 * dentro del puerto `IVideoTrackProcessor`.
 *
 * ════════════════════════════════════════════════════════════════
 * PIPELINE OFICIAL LiveKit — "Keep-Alive" pattern
 * Fuente: https://github.com/livekit/track-processors-js
 * ════════════════════════════════════════════════════════════════
 *
 * La documentación oficial establece que llamar setProcessor() / stopProcessor()
 * repetidamente causa artefactos visuales y re-inicialización del WASM.
 * El patrón recomendado es:
 *
 *   1. BackgroundProcessor({ mode: 'disabled' })   ← init en passthrough
 *   2. await track.setProcessor(processor)          ← UNA SOLA VEZ
 *   3. await processor.switchTo({ mode: 'blur' })   ← activar efecto
 *   4. await processor.switchTo({ mode: 'disabled'})← desactivar (no destroy)
 *   5. await track.stopProcessor()                  ← SOLO en cleanup final
 *
 * GARANTÍAS:
 *   - El WASM de MediaPipe se carga 1 sola vez por track
 *   - switchTo() es un hot-swap sin re-init del pipeline WebGL
 *   - No hay artefactos visuales ni freezes al toggle del efecto
 *   - Serial counter detecta operaciones concurrentes (race condition guard)
 *
 * ════════════════════════════════════════════════════════════════
 * API REAL de @livekit/track-processors v0.7.2
 * ════════════════════════════════════════════════════════════════
 *
 * BackgroundProcessor(options, name?) → BackgroundProcessorWrapper
 *   options.mode: 'background-blur' | 'virtual-background' | 'disabled'
 *   options.blurRadius?: number
 *   options.imagePath?: string
 *   options.maxFps?: number
 *
 * BackgroundProcessorWrapper:
 *   .switchTo({ mode, blurRadius?, imagePath? }) → hot-swap
 *   .mode → modo actual
 *
 * @see https://github.com/livekit/track-processors-js
 * @see src/core/domain/ports/IVideoTrackProcessor.ts
 * @see src/core/application/usecases/GestionarBackgroundVideoUseCase.ts
 */

import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
} from '@livekit/track-processors';
import type {
  SwitchBackgroundProcessorOptions,
} from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';
import { logger } from '@/lib/logger';
import type {
  IVideoTrackProcessor,
  VideoTrackProcessorConfig,
} from '../../domain/ports/IVideoTrackProcessor';

const log = logger.child('LiveKitOfficialBackgroundAdapter');

// ─── Tipos internos ───────────────────────────────────────────────────────────

type BackgroundProcessorInstance = ReturnType<typeof BackgroundProcessor>;

interface ActiveSession {
  track: LocalVideoTrack;
  processor: BackgroundProcessorInstance;
  /** Última configuración aplicada */
  config: VideoTrackProcessorConfig;
  /**
   * Estado del processor en el pipeline.
   * 'attached-disabled' → setProcessor() hecho, en passthrough, sin efecto visible
   * 'active'            → switchTo(blur|image) aplicado, efecto visible
   */
  lifecycleState: 'attached-disabled' | 'active';
}

// ─── Adaptador ────────────────────────────────────────────────────────────────

/**
 * Implementación de IVideoTrackProcessor usando el SDK oficial de LiveKit.
 *
 * Ciclo de vida por track:
 *   attachProcessor()  → init en 'disabled', setProcessor() [una vez]
 *   setEffect()        → switchTo(blur | virtual-background)
 *   disableEffect()    → switchTo('disabled')
 *   detachProcessor()  → stopProcessor() [cleanup final]
 */
export class LiveKitOfficialBackgroundAdapter implements IVideoTrackProcessor {
  private sessions = new Map<string, ActiveSession>();

  /**
   * Serial counter por trackId.
   * Incrementado al inicio de attachProcessor() y en detachProcessor().
   * Verificado DESPUÉS del await track.setProcessor() para detectar si la
   * operación fue superseded por un detach concurrente → previene processor
   * huérfano.
   */
  private attachCounters = new Map<string, number>();

  /**
   * Promesas de attach en vuelo por trackId.
   * Si una llamada a attachProcessor() ya está en progreso, las siguientes
   * esperan a que la primera complete en lugar de iniciar otro setProcessor().
   * Esto previene múltiples inits de WASM concurrentes (React Strict Mode,
   * multiple effects, rapid re-renders).
   */
  private pendingAttach = new Map<string, Promise<void>>();

  /**
   * Mapa de ID original por instancia de LocalVideoTrack.
   *
   * CRÍTICO: track.setProcessor() reemplaza track.mediaStreamTrack con el
   * output procesado (nuevo MediaStreamTrack con ID diferente). Sin este mapa,
   * getTrackId() devolvería un ID distinto antes y después de setProcessor():
   *
   *   ANTES: track.mediaStreamTrack.id = "43f42b20-..." (raw de getUserMedia)
   *   DESPUÉS: track.mediaStreamTrack.id = "8c0affe6-..." (output del processor)
   *
   * Bajo React Strict Mode:
   *   mount#1 → getTrackId → "43f42b20-..." → doAttach → setProcessor
   *   mount#2 → getTrackId → "8c0affe6-..." (¡DIFERENTE!) → doAttach → 2° WASM init
   *
   * Con este mapa:
   *   mount#1 → getTrackId → "43f42b20-..." → guardado en WeakMap → doAttach
   *   mount#2 → getTrackId → WeakMap hit → "43f42b20-..." → sesión encontrada → skip
   *
   * WeakMap: no impide GC del LocalVideoTrack cuando el componente se desmonta.
   */
  private stableTrackIds = new WeakMap<LocalVideoTrack, string>();

  // ─── IVideoTrackProcessor (puerto de dominio) ─────────────────────────────

  dispose(): void {
    for (const [trackId, session] of this.sessions) {
      this.attachCounters.set(
        trackId,
        (this.attachCounters.get(trackId) ?? 0) + 1,
      );
      this.stableTrackIds.delete(session.track);
      session.track.stopProcessor().catch(() => {});
      this.sessions.delete(trackId);
    }
    this.attachCounters.clear();
    this.pendingAttach.clear();
    log.info('LiveKitOfficialBackgroundAdapter disposed');
  }

  // ─── API pública del pipeline keep-alive ─────────────────────────────────

  /**
   * PASO 1 del ciclo de vida — Inicializa el processor en modo 'disabled'
   * y llama track.setProcessor() UNA SOLA VEZ.
   *
   * El processor queda en passthrough (no consume GPU para segmentación).
   * Después de este paso usar setEffect() / disableEffect() exclusivamente.
   *
   * Idempotente y serializado:
   *   - Si ya existe sesión → skip inmediato
   *   - Si hay un attach en vuelo → espera a que complete (no inicia otro)
   *   - Si no hay nada → crea processor en disabled + setProcessor
   */
  async attachProcessor(track: LocalVideoTrack): Promise<void> {
    if (!supportsBackgroundProcessors()) {
      log.warn('Browser no soporta background processors');
      return;
    }

    const trackId = this.getTrackId(track);

    // Guard 1: sesión ya registrada → skip
    if (this.sessions.has(trackId)) {
      log.debug('attachProcessor: sesión ya existe, skip', { trackId });
      return;
    }

    // Guard 2: attach en vuelo → esperar a que complete, no iniciar otro
    const pendingPromise = this.pendingAttach.get(trackId);
    if (pendingPromise) {
      log.debug('attachProcessor: esperando attach en vuelo', { trackId });
      await pendingPromise;
      return;
    }

    // Ejecutar el attach real y registrar la promesa
    const attachPromise = this.doAttach(track, trackId);
    this.pendingAttach.set(trackId, attachPromise);

    try {
      await attachPromise;
    } finally {
      // Limpiar solo si somos la promesa actual (no fue reemplazada)
      if (this.pendingAttach.get(trackId) === attachPromise) {
        this.pendingAttach.delete(trackId);
      }
    }
  }

  /**
   * Implementación interna de attach. Solo debe ser llamada desde attachProcessor()
   * después de verificar los guards de idempotencia y serialización.
   */
  private async doAttach(track: LocalVideoTrack, trackId: string): Promise<void> {
    const mySerial = (this.attachCounters.get(trackId) ?? 0) + 1;
    this.attachCounters.set(trackId, mySerial);

    log.info('attachProcessor: init en disabled (WASM carga una sola vez)', {
      trackId,
      serial: mySerial,
    });

    try {
      const processor = BackgroundProcessor({ mode: 'disabled' });
      await track.setProcessor(processor, true);

      // Verificar que no fuimos superseded por un detach o attach concurrente.
      // Si el serial cambió, otro attachProcessor() o detachProcessor() ya
      // actuó sobre este track. LiveKit SDK solo mantiene UN processor por
      // track: el último setProcessor() reemplaza internamente al anterior.
      // CRÍTICO: NO llamar track.stopProcessor() aquí — destruiría el
      // processor del serial actual, no el nuestro (ya reemplazado por el SDK).
      if (this.attachCounters.get(trackId) !== mySerial) {
        log.warn('attachProcessor superseded — skip (processor ya reemplazado por SDK)', {
          trackId,
          mySerial,
          currentSerial: this.attachCounters.get(trackId),
        });
        return;
      }

      this.sessions.set(trackId, {
        track,
        processor,
        config: { effectType: 'none' },
        lifecycleState: 'attached-disabled',
      });

      log.info('attachProcessor: processor listo en passthrough', { trackId });
    } catch (err) {
      log.error('attachProcessor: error en setProcessor', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * PASO 2 del ciclo de vida — Activa o cambia el efecto via switchTo().
   *
   * Requiere que attachProcessor() haya sido llamado previamente.
   * Si no hay sesión, la crea primero (attach implícito).
   *
   * Usa processor.switchTo() → hot-swap sin re-init de WASM/WebGL.
   */
  async setEffect(
    track: LocalVideoTrack,
    config: VideoTrackProcessorConfig,
  ): Promise<void> {
    if (!supportsBackgroundProcessors()) return;

    const trackId = this.getTrackId(track);

    // Attach implícito si no existe sesión
    if (!this.sessions.has(trackId)) {
      await this.attachProcessor(track);
    }

    const session = this.sessions.get(trackId);
    if (!session) return; // attach falló (browser no soportado)

    await this.switchEffect(session, config);
  }

  /**
   * PASO 3 del ciclo de vida — Desactiva el efecto via switchTo('disabled').
   *
   * El processor permanece attached al track en passthrough.
   * NO llama stopProcessor() — el WASM y el pipeline WebGL se mantienen vivos.
   * Para el siguiente setEffect() solo se necesita switchTo() sin re-init.
   */
  async disableEffect(track: LocalVideoTrack): Promise<void> {
    const trackId = this.getTrackId(track);
    const session = this.sessions.get(trackId);

    if (!session) {
      log.debug('disableEffect: no hay sesión activa', { trackId });
      return;
    }

    if (session.lifecycleState === 'attached-disabled') {
      log.debug('disableEffect: ya en passthrough, skip', { trackId });
      return;
    }

    try {
      await session.processor.switchTo({ mode: 'disabled' });
      session.config = { effectType: 'none' };
      session.lifecycleState = 'attached-disabled';
      log.info('disableEffect: efecto desactivado via switchTo(disabled)', {
        trackId,
      });
    } catch (err) {
      log.error('disableEffect: error en switchTo(disabled)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * PASO 4 del ciclo de vida — Cleanup final.
   *
   * Llama track.stopProcessor() para liberar WASM, WebGL y todos los recursos.
   * Solo debe llamarse en el unmount definitivo del componente.
   */
  async detachProcessor(track: LocalVideoTrack): Promise<void> {
    const trackId = this.getTrackId(track);

    // Invalida cualquier attachProcessor concurrente en vuelo
    this.attachCounters.set(
      trackId,
      (this.attachCounters.get(trackId) ?? 0) + 1,
    );
    this.pendingAttach.delete(trackId);

    try {
      await track.stopProcessor();
      log.info('detachProcessor: processor liberado', { trackId });
    } catch (err) {
      log.warn('detachProcessor: error en stopProcessor', {
        trackId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.sessions.delete(trackId);
      this.stableTrackIds.delete(track);
    }
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Devuelve un ID estable e inmutable para el wrapper desde el primer
   * encuentro. El cache WeakMap tiene precedencia sobre `track.sid`: si un
   * wrapper se ve antes de publicarse (preview) y después recibe `sid` al
   * publicar, seguimos devolviendo el ID original — de lo contrario el
   * adapter trataría al mismo wrapper como dos sesiones y haría dos
   * `setProcessor()`, destruyendo el generator que el HUD local ya tenía
   * attacheado al `<video>` (blur desaparece visualmente en local).
   */
  private getTrackId(track: LocalVideoTrack): string {
    const cached = this.stableTrackIds.get(track);
    if (cached) return cached;
    const id = track.sid ?? track.mediaStreamTrack.id;
    this.stableTrackIds.set(track, id);
    return id;
  }

  /**
   * Aplica un cambio de modo via processor.switchTo().
   * Hot-swap sin re-init: solo actualiza shaders/config del pipeline WebGL.
   *
   * Idempotencia: si la `config` entrante coincide con `session.config`, se
   * omite la llamada a `switchTo`. La doc oficial de `@livekit/track-processors`
   * no garantiza idempotencia de `switchTo(sameMode)` y en práctica se observó
   * que una cascada de re-aplicaciones (disparada por `ActiveSpeakersChanged`
   * bajando por `realtimeCoordinatorState → resolveActiveVideoTrack`) agota
   * los WebGL contexts del tab (Chromium ~16) hasta matar el canvas Three.js.
   * Este guard es defensa local independiente del fix upstream.
   */
  private async switchEffect(
    session: ActiveSession,
    config: VideoTrackProcessorConfig,
  ): Promise<void> {
    if (this.configEqual(session.config, config)) {
      log.debug('switchEffect: config sin cambios, skip', {
        effectType: config.effectType,
      });
      return;
    }

    const switchOpts = this.configToSwitchOptions(config);

    try {
      await session.processor.switchTo(switchOpts);
      session.config = { ...config };
      session.lifecycleState =
        config.effectType === 'none' ? 'attached-disabled' : 'active';

      log.debug('switchEffect: modo cambiado', {
        mode: switchOpts.mode,
        currentMode: session.processor.mode,
        lifecycleState: session.lifecycleState,
      });
    } catch (err) {
      log.error('switchEffect: error en switchTo()', {
        error: err instanceof Error ? err.message : String(err),
        targetMode: switchOpts.mode,
      });
      throw err;
    }
  }

  private configEqual(
    a: VideoTrackProcessorConfig,
    b: VideoTrackProcessorConfig,
  ): boolean {
    return (
      a.effectType === b.effectType &&
      (a.blurRadius ?? null) === (b.blurRadius ?? null) &&
      (a.backgroundImageUrl ?? null) === (b.backgroundImageUrl ?? null)
    );
  }

  /**
   * Mapea VideoTrackProcessorConfig → SwitchBackgroundProcessorOptions
   * para processor.switchTo() (todos los cambios después del attach).
   */
  private configToSwitchOptions(
    config: VideoTrackProcessorConfig,
  ): SwitchBackgroundProcessorOptions {
    switch (config.effectType) {
      case 'blur':
        return { mode: 'background-blur', blurRadius: config.blurRadius ?? 10 };
      case 'image':
        if (!config.backgroundImageUrl) {
          return { mode: 'background-blur', blurRadius: config.blurRadius ?? 10 };
        }
        return { mode: 'virtual-background', imagePath: config.backgroundImageUrl };
      default:
        return { mode: 'disabled' };
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let adapterInstance: LiveKitOfficialBackgroundAdapter | null = null;

export function getLiveKitBackgroundAdapter(): LiveKitOfficialBackgroundAdapter {
  if (!adapterInstance) {
    adapterInstance = new LiveKitOfficialBackgroundAdapter();
  }
  return adapterInstance;
}
