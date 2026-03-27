'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useRoomContext, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

const SILENT_AUDIO_LOOP = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface MeetingAudioTrackRenderable {
  attach: (element: HTMLMediaElement) => HTMLMediaElement;
  detach: (element: HTMLMediaElement) => HTMLMediaElement;
}

interface MeetingAudioTrackElementProps {
  track: MeetingAudioTrackRenderable;
  speakerDeviceId?: string;
}

const MeetingAudioTrackElement: React.FC<MeetingAudioTrackElementProps> = ({ track, speakerDeviceId }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = audioRef.current as (HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    if (!element) {
      return;
    }

    element.muted = false;
    track.attach(element);
    void element.play().catch(() => undefined);

    if (typeof element.setSinkId === 'function') {
      void element.setSinkId(speakerDeviceId || 'default').catch(() => undefined);
    }

    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [speakerDeviceId, track]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" data-meeting-audio-track="true" />;
};

interface MeetingAudioRendererProps {
  speakerDeviceId?: string;
}

export const MeetingAudioRenderer: React.FC<MeetingAudioRendererProps> = ({ speakerDeviceId }) => {
  const room = useRoomContext();
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const tracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const audioTracks = tracks.filter(
    (trackRef) => trackRef.source === Track.Source.Microphone
      && trackRef.publication?.isSubscribed
      && trackRef.publication?.track
      && !trackRef.participant?.isLocal,
  );

  const refreshAudioPlayback = useCallback(async () => {
    const roomWithStartAudio = room as { startAudio?: () => Promise<void> } | null;
    if (roomWithStartAudio?.startAudio) {
      try {
        await roomWithStartAudio.startAudio();
      } catch {
      }
    }

    const audioElements = Array.from(
      document.querySelectorAll('audio[data-meeting-audio-track="true"]'),
    ) as Array<HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }>;

    await Promise.all(audioElements.map(async (element) => {
      element.muted = false;
      if (typeof element.setSinkId === 'function') {
        await element.setSinkId(speakerDeviceId || 'default').catch(() => undefined);
      }
      await element.play().catch(() => undefined);
    }));

    const keepAliveAudio = keepAliveAudioRef.current;
    if (keepAliveAudio && audioTracks.length > 0) {
      keepAliveAudio.loop = true;
      keepAliveAudio.setAttribute('playsinline', 'true');
      keepAliveAudio.volume = 0.0001;
      await keepAliveAudio.play().catch(() => undefined);
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = audioTracks.length > 0 ? 'playing' : 'none';
    }
  }, [audioTracks.length, room, speakerDeviceId]);

  useEffect(() => {
    const keepAliveAudio = new Audio(SILENT_AUDIO_LOOP);
    keepAliveAudio.preload = 'auto';
    keepAliveAudioRef.current = keepAliveAudio;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = audioTracks.length > 0 ? 'playing' : 'none';
    }

    return () => {
      keepAliveAudio.pause();
      keepAliveAudio.src = '';
      keepAliveAudioRef.current = null;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
    };
  }, [audioTracks.length]);

  useEffect(() => {
    const handleUserGesture = () => {
      void refreshAudioPlayback();
    };

    const handleVisibilityOrResume = () => {
      void refreshAudioPlayback();
    };

    if (audioTracks.length > 0) {
      void refreshAudioPlayback();
    }

    window.addEventListener('pointerdown', handleUserGesture, { passive: true });
    window.addEventListener('touchend', handleUserGesture, { passive: true });
    window.addEventListener('keydown', handleUserGesture);
    window.addEventListener('focus', handleVisibilityOrResume);
    window.addEventListener('pageshow', handleVisibilityOrResume);
    document.addEventListener('visibilitychange', handleVisibilityOrResume);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleVisibilityOrResume);

    const heartbeatId = window.setInterval(() => {
      if (audioTracks.length > 0) {
        void refreshAudioPlayback();
      }
    }, 15000);

    return () => {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('touchend', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
      window.removeEventListener('focus', handleVisibilityOrResume);
      window.removeEventListener('pageshow', handleVisibilityOrResume);
      document.removeEventListener('visibilitychange', handleVisibilityOrResume);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleVisibilityOrResume);
      window.clearInterval(heartbeatId);
    };
  }, [audioTracks.length, refreshAudioPlayback]);

  return (
    <>
      {audioTracks.map((trackRef) => (
        <MeetingAudioTrackElement
          key={`${trackRef.participant?.identity || 'remote'}-${trackRef.publication?.trackSid || 'audio'}`}
          track={trackRef.publication?.track as MeetingAudioTrackRenderable}
          speakerDeviceId={speakerDeviceId}
        />
      ))}
    </>
  );
};

export default MeetingAudioRenderer;
