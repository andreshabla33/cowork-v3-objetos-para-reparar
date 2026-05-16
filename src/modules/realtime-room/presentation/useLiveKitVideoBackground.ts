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
 * CICLO DE VIDA (detach-on-disable, 2026-05-14)
 * ════════════════════════════════════════════════════════════════
 *
 *   setEffect(track, cfg)  → attach implícito + switchTo(blur|vbg)
 *   disableEffect(track)   → stopProcessor() — libera GPU/WebGL del processor
 *   detachFromTrack(track) → stopProcessor() (cleanup final si quedó sesión)
 *
 * Cambio clave: cuando effectType === 'none', el processor se LIBERA
 * (no se mantiene en passthrough). Razón: en GPU integrada el MediaPipe
 * graph cuesta 5-15 ms/frame aunque esté en 'disabled' mode. Re-activar
 * blur reattach con WASM cacheado (~100 ms) — UX aceptable.
 *
 * Garantías:
 *   ✅ Sin attach proactivo: el processor solo existe cuando se usa.
 *   ✅ Deferred detach (setTimeout 0) tolera React Strict Mode.
 *   ✅ Reactivo a cambios de identidad del track.
 *
 * @see https://github.com/livekit/track-processors-js
 * @see src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter.ts
 * @see src/core/application/usecases/GestionarBackgroundVideoUseCase.ts
 */

import { useEffect, useRef } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import { GestionarBackgroundVideoUseCase } from '@/src/core/application/usecases/GestionarBackgroundVideoUseCase';
import { getLiveKitBackgroundAdapter } from '@/src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter';
import { getLocalVideoTrackFactory } from '@/src/core/infrastructure/adapters/LocalVideoTrackFactory';
import { getBackgroundCapability } from '@/src/core/infrastructure/browser/BackgroundCapabilityDetector';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';
import type { VideoTrackHandle } from '@/src/core/domain/types/media';
import { logger } from '@/core/infrastructure/observability/logger';

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

  /** Factory para traducir LocalVideoTrack ↔ VideoTrackHandle. */
  const factory = getLocalVideoTrackFactory();

  /** Determina el `kind` del handle según el `Track.Source` del LocalVideoTrack. */
  const kindOf = (lt: LocalVideoTrack): 'camera' | 'screen' | 'background' => {
    const src = lt.source as unknown as string;
    if (src === 'screen_share' || src === 'screen_share_audio') return 'screen';
    return 'camera';
  };

  const handleFromTrack = (lt: LocalVideoTrack): VideoTrackHandle =>
    factory.handleOf(lt, kindOf(lt));

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

        // ── Cleanup del track anterior si cambió ──────────────────────────
        // No hay attach proactivo: setEffect() hace attach implícito cuando
        // se necesita. Si effect=none, el processor NO se crea.
        if (attachedTrackRef.current && attachedTrackRef.current !== track) {
          await useCase.detachFromTrack(handleFromTrack(attachedTrackRef.current));
          if (cancelled) return;
          log.info('previous track detached');
        }
        attachedTrackRef.current = track;

        if (cancelled) return;

        // ── Aplicar o desactivar el efecto ────────────────────────────────
        if (wantEffect) {
          // setEffect hace attach implícito si no hay sesión (WASM cached → ~100ms)
          await useCase.setEffect(handleFromTrack(track), {
            effectType,
            blurRadius,
            backgroundImageUrl: backgroundImage ?? undefined,
          });
          if (!cancelled) {
            log.info('effect applied', {
              effectType,
              trackId: track.sid ?? track.mediaStreamTrack.id,
            });
          }
        } else {
          // disableEffect libera el processor real (stopProcessor),
          // no lo deja en passthrough. Ahorra 5-15ms/frame de GPU.
          await useCase.disableEffect(handleFromTrack(track));
          if (!cancelled) {
            log.info('effect disabled (processor released)');
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
          void useCase.detachFromTrack(handleFromTrack(trackToDetach)).catch(() => {});
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
