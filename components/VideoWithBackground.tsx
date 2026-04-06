/**
 * @module components/VideoWithBackground
 *
 * Componente de presentación puro para renderizar video local.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentación
 * ════════════════════════════════════════════════════════════════
 *
 * Este componente es un renderer puro: conecta un LocalVideoTrack o
 * MediaStream a un elemento <video> del DOM. NO gestiona el ciclo de
 * vida del background processor (attach/detach/setEffect).
 *
 * El lifecycle del processor es responsabilidad de la capa de
 * Application, gestionado por useMeetingMediaBridge via
 * GestionarBackgroundVideoUseCase.
 *
 * PATH NATIVO (LocalVideoTrack proporcionado):
 *   Usa track.attach(videoEl) / track.detach(videoEl) del SDK de LiveKit.
 *   El processor ya fue aplicado por el bridge → el video muestra
 *   el output procesado directamente.
 *
 * PATH FALLBACK (solo MediaStream, sin LocalVideoTrack):
 *   Asigna stream crudo al <video>.srcObject.
 *
 * @see components/meetings/videocall/hooks/useMeetingMediaBridge.ts
 * @see src/core/application/usecases/GestionarBackgroundVideoUseCase.ts
 */

import React, { useEffect, useRef, memo } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';

// Re-exportar para compatibilidad con consumidores que importan desde aquí
export type { EffectType };
export type BackgroundEffectType = EffectType;

// ─── Props ────────────────────────────────────────────────────────────────────

interface VideoWithBackgroundProps {
  /** Stream de la cámara local (usado en path fallback) */
  stream: MediaStream | null;
  /** Tipo de efecto de fondo (informativo — el effect se aplica en el bridge) */
  effectType: EffectType;
  /** Silenciar el elemento de video */
  muted?: boolean;
  className?: string;
  /** Espejo horizontal del video */
  mirrorVideo?: boolean;
  /**
   * LocalVideoTrack de LiveKit para el path nativo.
   * Cuando se proporciona, usa track.attach() del SDK para conectar al <video>.
   * El processor ya fue aplicado por useMeetingMediaBridge.
   */
  localVideoTrack?: LocalVideoTrack | null;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const VideoWithBackground = memo(({
  stream,
  effectType,
  muted = false,
  className = '',
  mirrorVideo = false,
  localVideoTrack,
}: VideoWithBackgroundProps) => {

  const videoRef = useRef<HTMLVideoElement>(null);

  // El path nativo requiere un LocalVideoTrack
  const useNativePath = !!localVideoTrack;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH NATIVO — track.attach(videoEl) / track.detach(videoEl)
  // El processor ya fue aplicado por el bridge → el <video> muestra
  // el output procesado automáticamente.
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!useNativePath || !localVideoTrack) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    localVideoTrack.attach(videoEl);

    return () => {
      localVideoTrack.detach(videoEl);
      videoEl.srcObject = null;
    };
  }, [useNativePath, localVideoTrack]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH FALLBACK — Browser sin Insertable Streams
  // Muestra stream crudo sin procesamiento.
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (useNativePath) return;
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
    }

    return () => {
      if (videoEl) videoEl.srcObject = null;
    };
  }, [useNativePath, stream]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!stream && !localVideoTrack) return null;

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        className={`w-full h-full object-cover${mirrorVideo ? ' mirror' : ''}`}
      />
    </div>
  );
});

VideoWithBackground.displayName = 'VideoWithBackground';

export default VideoWithBackground;
