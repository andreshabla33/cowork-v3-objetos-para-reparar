/**
 * @module realtime-room/presentation/useLiveKitVideoBackground
 *
 * Hook compartido que orquesta el ciclo de vida del background processor
 * (blur / virtual background) sobre un `LocalVideoTrack` de LiveKit.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation
 * ════════════════════════════════════════════════════════════════
 *
 * Fuente única de verdad para los dos flujos de la app:
 *   - Reuniones (`useMeetingMediaBridge`)
 *   - Espacio 3D (`VirtualSpace3D`)
 *
 * Consume el usecase de Application (`GestionarBackgroundVideoUseCase`)
 * y el adapter de Infrastructure (`LiveKitOfficialBackgroundAdapter`);
 * no conoce detalles del SDK de LiveKit.
 *
 * ════════════════════════════════════════════════════════════════
 * CICLO DE VIDA (patrón oficial LiveKit track-processors-js)
 * ════════════════════════════════════════════════════════════════
 *
 *   attachToTrack(track)   → setProcessor(BackgroundProcessor({ mode: 'disabled' }))
 *   setEffect(track, cfg)  → processor.switchTo({ mode: 'background-blur' | ... })
 *   disableEffect(track)   → processor.switchTo({ mode: 'disabled' }) — processor vivo
 *   detachFromTrack(track) → stopProcessor() — libera WASM/WebGL (solo en unmount)
 *
 * Garantías:
 *   ✅ WASM de MediaPipe se inicializa 1 sola vez por track.
 *   ✅ Cambios de efecto son hot-swaps O(1) — sin re-init de GPU/WebGL.
 *   ✅ Deferred detach (setTimeout 0) que tolera React Strict Mode.
 *   ✅ Reactivo a cambios de identidad del track (remount/republish):
 *      detach del anterior → attach del nuevo antes de aplicar el efecto.
 *
 * @see https://github.com/livekit/track-processors-js
 * @see src/core/application/usecases/GestionarBackgroundVideoUseCase.ts
 */

import { useEffect, useRef } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import { GestionarBackgroundVideoUseCase } from '@/src/core/application/usecases/GestionarBackgroundVideoUseCase';
import { getLiveKitBackgroundAdapter } from '@/src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter';
import { getBackgroundCapability } from '@/src/core/infrastructure/browser/BackgroundCapabilityDetector';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';
import { logger } from '@/lib/logger';

const log = logger.child('useLiveKitVideoBackground');

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface UseLiveKitVideoBackgroundParams {
  /**
   * Función que resuelve el `LocalVideoTrack` activo (publicado o preview).
   * Para que el hook reaccione a cambios de publicación, la referencia de la
   * función debe cambiar cuando la identidad del track cambie (típicamente
   * memoizada con deps: `[room, previewVideoTrack]` o `[publicationSid]`).
   */
  resolveActiveVideoTrack: () => LocalVideoTrack | null;

  /** Efecto deseado: 'none' | 'blur' | 'image'. */
  effectType: EffectType;

  /** URL/base64 de la imagen de fondo (solo para `effectType === 'image'`). */
  backgroundImage?: string | null;

  /** Radio de blur (solo para `effectType === 'blur'`). Default: 12. */
  blurRadius?: number;

  /**
   * Gate principal: la cámara está encendida (`desiredCameraEnabled`).
   * Cuando es `false`, el efecto se desactiva aunque el track siga publicado
   * (evita MediaPipe corriendo con la cámara apagada).
   */
  enabled: boolean;
}

export interface UseLiveKitVideoBackgroundReturn {
  /** `true` si el video local está siendo procesado con un efecto visible. */
  isLocalVideoProcessed: boolean;
  /** `true` si el browser soporta el pipeline de background processors. */
  supports: boolean;
  /** `true` si el procesamiento ocurre off-main-thread (Chrome 94+). */
  isOffMainThread: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveKitVideoBackground(
  params: UseLiveKitVideoBackgroundParams,
): UseLiveKitVideoBackgroundReturn {
  const {
    resolveActiveVideoTrack,
    effectType,
    backgroundImage,
    blurRadius = 12,
    enabled,
  } = params;

  // Use Case singleton por montaje del hook. Se construye lazy 1 sola vez.
  const useCaseRef = useRef<GestionarBackgroundVideoUseCase | null>(null);
  if (!useCaseRef.current) {
    useCaseRef.current = new GestionarBackgroundVideoUseCase(getLiveKitBackgroundAdapter());
  }

  /** Último `LocalVideoTrack` sobre el que se hizo `attachProcessor`. */
  const attachedTrackRef = useRef<LocalVideoTrack | null>(null);

  /**
   * Deferred detach — React Strict Mode safe.
   * El cleanup programa el `detachFromTrack()` en `setTimeout(0)`; si hay
   * remount inmediato (Strict Mode), mount#2 cancela el timer → el WASM no
   * se destruye ni re-inicializa.
   */
  const deferredDetachRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const useCase = useCaseRef.current;
    if (!useCase) return;

    // Cancelar cualquier deferred detach programado por un cleanup previo.
    if (deferredDetachRef.current !== null) {
      clearTimeout(deferredDetachRef.current);
      deferredDetachRef.current = null;
      log.debug('deferred detach cancelado (remount Strict Mode)');
    }

    const track = resolveActiveVideoTrack();
    const wantEffect = effectType !== 'none' && enabled;

    let cancelled = false;

    void (async () => {
      try {
        if (!track) {
          // Sin track disponible: el deferred detach del cleanup anterior
          // libera recursos si corresponde. Nada que hacer aquí.
          return;
        }

        // ── Attach idempotente al track actual ────────────────────────────
        if (attachedTrackRef.current !== track) {
          if (attachedTrackRef.current) {
            await useCase.detachFromTrack(attachedTrackRef.current);
          }
          await useCase.attachToTrack(track);
          if (cancelled) return;
          attachedTrackRef.current = track;
          log.info('processor attached', {
            trackId: track.sid ?? track.mediaStreamTrack.id,
          });
        }

        if (cancelled) return;

        // ── Aplicar o desactivar el efecto ────────────────────────────────
        if (wantEffect) {
          await useCase.setEffect(track, {
            effectType,
            blurRadius,
            backgroundImageUrl: backgroundImage ?? undefined,
          });
          if (!cancelled) {
            log.info('effect applied', { effectType });
          }
        } else {
          await useCase.disableEffect(track);
          if (!cancelled) {
            log.info('effect disabled (passthrough)');
          }
        }
      } catch (err) {
        if (!cancelled) {
          log.error('lifecycle error', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      // Diferir detach al siguiente macrotask para tolerar Strict Mode.
      const trackToDetach = attachedTrackRef.current;
      deferredDetachRef.current = setTimeout(() => {
        deferredDetachRef.current = null;
        if (trackToDetach) {
          log.info('deferred detach ejecutado (unmount real)');
          void useCase.detachFromTrack(trackToDetach).catch(() => {});
          attachedTrackRef.current = null;
        }
      }, 0);
    };
  }, [resolveActiveVideoTrack, effectType, backgroundImage, blurRadius, enabled]);

  const capability = getBackgroundCapability();

  return {
    isLocalVideoProcessed: effectType !== 'none' && enabled,
    supports: capability.supported,
    isOffMainThread: capability.offMainThread,
  };
}
