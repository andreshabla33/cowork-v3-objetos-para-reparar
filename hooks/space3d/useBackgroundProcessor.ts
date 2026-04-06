/**
 * @module hooks/space3d/useBackgroundProcessor
 *
 * Hook para gestionar background effects en el espacio 3D publicado.
 * Orquesta el ciclo de vida del background processor via
 * GestionarBackgroundVideoUseCase para mantener Clean Architecture.
 *
 * ════════════════════════════════════════════════════════════════
 * PIPELINE — keep-alive (patrón oficial LiveKit)
 * ════════════════════════════════════════════════════════════════
 *
 * Cuando el track publicado está disponible:
 *   1. attachToTrack()  → setProcessor(disabled) una sola vez
 *   2. setEffect()      → switchTo(blur|image) — solo cuando effectType ≠ 'none'
 *   3. disableEffect()  → switchTo(disabled) — al cambiar a 'none'
 *   4. detachFromTrack() → stopProcessor() — al desmontar el hook
 *
 * Garantías:
 *   ✅ Sin freeze — WASM se inicia 1 sola vez mientras el track viva
 *   ✅ Cambio de efecto instantáneo via switchTo() sin re-init
 *   ✅ Off-main-thread en Chrome 94+ — no compite con el render de Three.js
 *   ✅ Interfaz pública sin cambios — VirtualSpace3D no requiere modificación
 *
 * @see src/core/application/usecases/GestionarBackgroundVideoUseCase.ts
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import { logger } from '@/lib/logger';
import { GestionarBackgroundVideoUseCase } from '@/src/core/application/usecases/GestionarBackgroundVideoUseCase';
import { getLiveKitBackgroundAdapter } from '@/src/core/infrastructure/adapters/LiveKitOfficialBackgroundAdapter';
import { getBackgroundCapability } from '@/src/core/infrastructure/browser/BackgroundCapabilityDetector';
import type { VideoTrackProcessorConfig, EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';

const log = logger.child('useBackgroundProcessor');

// ─── Interfaces públicas ───────────────────────────────────────────────────────

export interface UseBackgroundProcessorParams {
  /** Tipo de efecto activo */
  effectType: EffectType;
  /** Radio de blur (solo para effectType='blur') */
  blurRadius?: number;
  /** URL/base64 de la imagen de fondo (solo para effectType='image') */
  backgroundImage?: string | null;
  /** Función para obtener el LocalVideoTrack publicado en LiveKit */
  getPublishedVideoTrack: () => LocalVideoTrack | null;
}

export interface UseBackgroundProcessorReturn {
  /** Si el processor está activo con un efecto visible */
  isProcessorActive: boolean;
  /** Aplica o actualiza el efecto en el track actual */
  applyProcessor: () => Promise<void>;
  /** Desactiva el efecto (processor permanece adjunto en passthrough) */
  removeProcessor: () => Promise<void>;
  /** Si el procesamiento ocurre off-main-thread (Chrome 94+) */
  isOffMainThread: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBackgroundProcessor(
  params: UseBackgroundProcessorParams,
): UseBackgroundProcessorReturn {
  const {
    effectType,
    blurRadius = 12,
    backgroundImage,
    getPublishedVideoTrack,
  } = params;

  const attachedTrackRef = useRef<LocalVideoTrack | null>(null);
  const [isProcessorActive, setIsProcessorActive] = useState(false);

  // Use Case singleton estable entre renders
  const useCase = useMemo(
    () => new GestionarBackgroundVideoUseCase(getLiveKitBackgroundAdapter()),
    [],
  );

  const capability = getBackgroundCapability();

  // ─── Construir config del dominio ─────────────────────────────────────────

  const buildConfig = useCallback((): VideoTrackProcessorConfig => ({
    effectType,
    blurRadius,
    backgroundImageUrl: backgroundImage ?? undefined,
  }), [effectType, blurRadius, backgroundImage]);

  // ─── Attach implícito cuando llega el track ───────────────────────────────
  //
  // Se ejecuta la primera vez que getPublishedVideoTrack() retorna un track.
  // Registra el track en attachedTrackRef para el cleanup final.

  const ensureAttached = useCallback(async (
    track: LocalVideoTrack,
  ): Promise<void> => {
    if (attachedTrackRef.current === track) return; // ya adjunto

    await useCase.attachToTrack(track);
    attachedTrackRef.current = track;
    log.debug('ensureAttached: processor adjunto en passthrough', {
      trackId: track.sid ?? track.mediaStreamTrack.id,
      offMainThread: capability.offMainThread,
    });
  }, [useCase, capability.offMainThread]);

  // ─── Aplicar / actualizar efecto ─────────────────────────────────────────

  const applyProcessor = useCallback(async () => {
    const track = getPublishedVideoTrack();
    if (!track) {
      log.debug('applyProcessor: track no disponible — aplazando');
      return;
    }

    try {
      await ensureAttached(track);
      const config = buildConfig();
      await useCase.setEffect(track, config);
      setIsProcessorActive(config.effectType !== 'none');

      log.info('applyProcessor: efecto actualizado', {
        effectType: config.effectType,
      });
    } catch (err) {
      log.error('applyProcessor: error', {
        error: err instanceof Error ? err.message : String(err),
      });
      setIsProcessorActive(false);
    }
  }, [getPublishedVideoTrack, ensureAttached, buildConfig, useCase]);

  // ─── Deshabilitar efecto (switchTo disabled — processor vivo) ────────────

  const removeProcessor = useCallback(async () => {
    const track = getPublishedVideoTrack();
    if (!track) return;

    try {
      await useCase.disableEffect(track);
      setIsProcessorActive(false);
      log.info('removeProcessor: efecto desactivado (processor en passthrough)');
    } catch (err) {
      log.error('removeProcessor: error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [getPublishedVideoTrack, useCase]);

  // ─── Auto-apply cuando cambian los parámetros ────────────────────────────

  useEffect(() => {
    void applyProcessor();
  }, [applyProcessor]);

  // ─── Cleanup al desmontar: detach final (stopProcessor) ──────────────────

  useEffect(() => {
    return () => {
      const track = attachedTrackRef.current;
      if (track) {
        useCase.detachFromTrack(track).catch(() => {});
        attachedTrackRef.current = null;
      }
    };
    // Solo al unmount definitivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isProcessorActive,
    applyProcessor,
    removeProcessor,
    isOffMainThread: capability.offMainThread,
  };
}
