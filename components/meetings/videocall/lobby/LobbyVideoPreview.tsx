/**
 * @module components/meetings/videocall/lobby/LobbyVideoPreview
 *
 * Columna izquierda del lobby: preview de cámara, avatar de fallback y overlay
 * de controles de media (vía children).
 *
 * Presentation layer — recibe estado derivado de useLobbyState, sin lógica propia.
 */

'use client';

import React, { useRef, useEffect } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import { VideoWithBackground } from '@/components/VideoWithBackground';
import type { CameraSettings } from '@/modules/realtime-room';

interface LobbyVideoPreviewProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
  cameraSettings: CameraSettings;
  localVideoTrackForBg: LocalVideoTrack | null;
  /** Initial del usuario para el avatar cuando la cámara está desactivada */
  nombreInicial: string;
  /** Bloquea la UI mientras se conecta a la sala */
  joining: boolean;
  /** Slot para los controles de media superpuestos (LobbyMediaControls) */
  children?: React.ReactNode;
}

export const LobbyVideoPreview: React.FC<LobbyVideoPreviewProps> = ({
  stream,
  cameraEnabled,
  cameraSettings,
  localVideoTrackForBg,
  nombreInicial,
  joining,
  children,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Asigna el stream al elemento <video> nativo para la vista sin efectos
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream && cameraEnabled) {
      video.srcObject = stream;
    } else {
      video.pause();
      video.srcObject = null;
    }
  }, [cameraEnabled, stream]);

  const showRawVideo =
    cameraEnabled &&
    !cameraSettings.hideSelfView &&
    cameraSettings.backgroundEffect === 'none';

  const showBgVideo =
    cameraEnabled &&
    !cameraSettings.hideSelfView &&
    stream !== null &&
    stream.getVideoTracks().length > 0 &&
    cameraSettings.backgroundEffect !== 'none';

  const showAvatar = !cameraEnabled || cameraSettings.hideSelfView;

  const initial = nombreInicial ? nombreInicial.charAt(0).toUpperCase() : '?';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      {/* ── Video con efectos de fondo ───────────────────────────────
           Los props `backgroundImage`/`blurAmount` ya no existen en el
           contrato (el processor se aplica en el bridge, no en el
           <video>). Fix P2 — plan 34919757. */}
      {showBgVideo && (
        <VideoWithBackground
          stream={stream!}
          effectType={cameraSettings.backgroundEffect}
          muted
          className="absolute inset-0 h-full w-full object-cover"
          mirrorVideo={cameraSettings.mirrorVideo}
          localVideoTrack={localVideoTrackForBg}
        />
      )}

      {/* ── Video raw (sin efectos) ───────────────────────────────── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        className={[
          'absolute inset-0 h-full w-full object-cover',
          showRawVideo ? '' : 'hidden',
          cameraSettings.mirrorVideo ? 'mirror' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      {/* ── Avatar (cámara desactivada) ───────────────────────────── */}
      {showAvatar && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 shadow-2xl shadow-blue-600/30 sm:h-28 sm:w-28 lg:h-32 lg:w-32 2xl:h-36 2xl:w-36">
            <span className="text-3xl font-black text-white sm:text-4xl lg:text-5xl 2xl:text-6xl">
              {initial}
            </span>
          </div>
        </div>
      )}

      {/* ── Overlay de "Conectando..." ────────────────────────────── */}
      {joining && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500/30 border-t-sky-400" />
            <span className="text-sm font-bold text-zinc-400">Conectando...</span>
          </div>
        </div>
      )}

      {/* ── Slot para controles superpuestos (LobbyMediaControls) ──
           bottom-2 evita que el border-radius del grid padre recorte
           los controles cuando la columna se comprime por max-h. */}
      {children && (
        <div className="absolute inset-x-0 bottom-2 z-10 sm:bottom-3">
          {children}
        </div>
      )}
    </div>
  );
};
