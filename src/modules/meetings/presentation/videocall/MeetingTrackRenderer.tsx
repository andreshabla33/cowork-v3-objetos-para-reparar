'use client';

import React, { useEffect, useRef } from 'react';
import { Track, TrackEvent } from 'livekit-client';

export interface MeetingRenderableVideoTrack {
  attach: (element: HTMLMediaElement) => HTMLMediaElement;
  detach: (element: HTMLMediaElement) => HTMLMediaElement;
}

interface MeetingTrackRendererProps {
  track: MeetingRenderableVideoTrack | null | undefined;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
  dataLocalParticipant?: boolean;
}

export const MeetingTrackRenderer: React.FC<MeetingTrackRendererProps> = ({
  track,
  muted = false,
  className = '',
  mirror = false,
  dataLocalParticipant = false,
}) => {
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoElementRef.current;
    if (!element) {
      return;
    }

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const attemptPlay = () => {
      void element.play().catch(() => {
        if (retryTimeout) {
          clearTimeout(retryTimeout);
        }
        retryTimeout = setTimeout(() => {
          void element.play().catch(() => undefined);
        }, 250);
      });
    };
    const handleCanPlay = () => {
      attemptPlay();
    };

    element.muted = muted;

    if (!track) {
      element.pause();
      element.srcObject = null;
      return;
    }

    track.attach(element);
    element.addEventListener('loadedmetadata', handleCanPlay);
    element.addEventListener('canplay', handleCanPlay);
    attemptPlay();

    // Escuchar TrackEvent.TrackProcessorUpdate del SDK de LiveKit.
    // Cuando setProcessor(processor, showProcessedStreamLocally=true) completa,
    // el SDK reemplaza el mediaStreamTrack en los attachedElements internamente,
    // pero el video element puede necesitar un play() adicional para mostrar
    // los nuevos frames procesados (blur/virtual-background).
    //
    // NOTA: Track.Event NO existe como propiedad estática en livekit-client.
    // Se debe importar TrackEvent directamente del paquete.
    const lkTrack = track as unknown as Track;
    const hasEvents = typeof lkTrack?.on === 'function';
    const handleProcessorUpdate = () => {
      // Re-attach para obtener el mediaStreamTrack procesado actualizado
      track.attach(element);
      attemptPlay();
    };
    if (hasEvents) {
      lkTrack.on(TrackEvent.TrackProcessorUpdate, handleProcessorUpdate);
    }

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      element.removeEventListener('loadedmetadata', handleCanPlay);
      element.removeEventListener('canplay', handleCanPlay);
      if (hasEvents) {
        lkTrack.off(TrackEvent.TrackProcessorUpdate, handleProcessorUpdate);
      }
      element.pause();
      track.detach(element);
      element.srcObject = null;
    };
  }, [muted, track]);

  return (
    <video
      ref={videoElementRef}
      autoPlay
      playsInline
      muted={muted}
      data-local-participant={dataLocalParticipant ? 'true' : 'false'}
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
};
