/**
 * @module hooks/space3d/useMediaStream
 * Hook para gestión de streams de media (getUserMedia), audio procesado,
 * screen share, y estabilidad de audio/video con Page Visibility API.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CameraSettings, AudioSettings } from '@/modules/realtime-room';
import { createProcessedAudioTrack, type ProcessedAudioTrackHandle } from '@/lib/audioProcessing';
import { getVideoConstraints } from '@/lib/userSettings';
import { logger } from '@/lib/logger';
import { type UseMediaStreamReturn } from './types';

const log = logger.child('use-media-stream');

export function useMediaStream(params: {
  desiredMediaState: { isMicrophoneEnabled: boolean; isCameraEnabled: boolean; isScreenShareEnabled: boolean };
  cameraSettings: CameraSettings;
  audioSettings: AudioSettings;
  setScreenShareDesiredState: (value?: boolean) => void;
}): UseMediaStreamReturn {
  const { desiredMediaState, cameraSettings, audioSettings, setScreenShareDesiredState } = params;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const activeScreenRef = useRef<MediaStream | null>(null);

  // ========== Audio procesado ==========
  const audioProcesadoRef = useRef<ProcessedAudioTrackHandle | null>(null);

  const limpiarAudioProcesado = useCallback(() => {
    const actual = audioProcesadoRef.current;
    if (!actual) return;
    actual.dispose();
    audioProcesadoRef.current = null;
  }, []);

  const crearAudioProcesado = useCallback(async (track: MediaStreamTrack, nivel: 'standard' | 'enhanced') => {
    limpiarAudioProcesado();
    const processedHandle = await createProcessedAudioTrack(track, nivel);
    if (!processedHandle) {
      return null;
    }

    audioProcesadoRef.current = processedHandle;

    return processedHandle.track;
  }, [limpiarAudioProcesado]);

  // ========== getUserMedia management ==========
  const isProcessingStreamRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const shouldHaveStreamRef = useRef(false);
  shouldHaveStreamRef.current = desiredMediaState.isMicrophoneEnabled || desiredMediaState.isCameraEnabled || desiredMediaState.isScreenShareEnabled;

  useEffect(() => {
    let mounted = true;

    const manageStream = async () => {
      if (isProcessingStreamRef.current) {
        log.info('ManageStream busy, marking pending update', { processing: true });
        pendingUpdateRef.current = true;
        return;
      }

      const shouldHaveStream = shouldHaveStreamRef.current;
      log.info('ManageStream starting', { shouldHaveStream });

      try {
        isProcessingStreamRef.current = true;

        if (shouldHaveStream) {
          if (!activeStreamRef.current) {
            const videoConstraints: MediaTrackConstraints = getVideoConstraints();
            if (cameraSettings.selectedCameraId) {
              videoConstraints.deviceId = { exact: cameraSettings.selectedCameraId };
            }

            const audioConstraints: MediaTrackConstraints = {
              noiseSuppression: audioSettings.noiseReduction,
              echoCancellation: audioSettings.echoCancellation,
              autoGainControl: audioSettings.autoGainControl,
            };
            if (audioSettings.selectedMicrophoneId) {
              audioConstraints.deviceId = { exact: audioSettings.selectedMicrophoneId };
            }

            const wantVideo = desiredMediaState.isCameraEnabled || desiredMediaState.isScreenShareEnabled;
            const wantAudio = desiredMediaState.isMicrophoneEnabled;
            const mediaConstraints: MediaStreamConstraints = {};
            if (wantVideo) mediaConstraints.video = videoConstraints;
            if (wantAudio) mediaConstraints.audio = audioConstraints;
            if (!wantVideo && !wantAudio) mediaConstraints.audio = audioConstraints;

            log.info('Requesting media access', { wantVideo, wantAudio });
            const newStream = await navigator.mediaDevices.getUserMedia(mediaConstraints).catch(async (err) => {
              if (cameraSettings.selectedCameraId || audioSettings.selectedMicrophoneId) {
                log.warn('Selected device not available, using default', { error: err instanceof Error ? err.message : String(err) });
                const fallbackConstraints: MediaStreamConstraints = {};
                if (wantVideo) fallbackConstraints.video = getVideoConstraints();
                if (wantAudio || !wantVideo) fallbackConstraints.audio = {
                  noiseSuppression: audioSettings.noiseReduction,
                  echoCancellation: audioSettings.echoCancellation,
                  autoGainControl: audioSettings.autoGainControl,
                };
                return navigator.mediaDevices.getUserMedia(fallbackConstraints);
              }
              if (wantVideo && err.name === 'NotReadableError') {
                log.warn('Camera in use, falling back to audio-only', { error: err instanceof Error ? err.message : String(err) });
                return navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
              }
              throw err;
            });

            if (!mounted) {
              newStream.getTracks().forEach(t => t.stop());
              return;
            }

            if (!shouldHaveStreamRef.current) {
              log.info('Stream loaded but no longer needed, stopping', {});
              newStream.getTracks().forEach(t => t.stop());
              return;
            }

            let streamToUse = newStream;
            const audioTrack = newStream.getAudioTracks()[0];
            if (audioTrack && audioSettings.noiseReduction) {
              const nivel = audioSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : 'standard';
              const processedTrack = await crearAudioProcesado(audioTrack, nivel);
              if (processedTrack) {
                const mixed = new MediaStream([processedTrack, ...newStream.getVideoTracks()]);
                streamToUse = mixed;
              }
            } else {
              limpiarAudioProcesado();
            }

            activeStreamRef.current = streamToUse;
            setStream(streamToUse);
            log.info('Camera/mic stream started', { hasAudio: !!audioTrack, hasVideo: streamToUse.getVideoTracks().length > 0 });
          }

          // Actualizar estado de tracks
          if (activeStreamRef.current) {
            activeStreamRef.current.getAudioTracks().forEach(track => track.enabled = desiredMediaState.isMicrophoneEnabled);

            const videoTracks = activeStreamRef.current.getVideoTracks();
            if (!desiredMediaState.isCameraEnabled && videoTracks.length > 0) {
              log.info('Camera OFF - stopping video track to release hardware', { trackCount: videoTracks.length });
              videoTracks.forEach(track => {
                track.stop();
                activeStreamRef.current?.removeTrack(track);
              });
            } else if (desiredMediaState.isCameraEnabled && videoTracks.length === 0 && activeStreamRef.current) {
              log.info('Camera ON - requesting new video track', {});
              try {
                const videoConstraints: MediaTrackConstraints = getVideoConstraints();
                if (cameraSettings.selectedCameraId) {
                  videoConstraints.deviceId = { exact: cameraSettings.selectedCameraId };
                }
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
                const newVideoTrack = videoStream.getVideoTracks()[0];
                if (newVideoTrack && activeStreamRef.current) {
                  activeStreamRef.current.addTrack(newVideoTrack);
                  setStream(new MediaStream(activeStreamRef.current.getTracks()));
                }
              } catch (e) {
                log.error('Error getting video track', { error: e instanceof Error ? e.message : String(e) });
              }
            }
          }
        } else {
          // Re-check with delay
          await new Promise(r => setTimeout(r, 300));
          if (shouldHaveStreamRef.current) {
            log.info('ManageStream: stop cancelled - shouldHaveStream changed to true', {});
            return;
          }
          if (activeStreamRef.current) {
            log.info('Stopping camera/mic - user disabled all media', { trackCount: activeStreamRef.current.getTracks().length });
            const tracks = activeStreamRef.current.getTracks();
            tracks.forEach(track => { track.stop(); });
            activeStreamRef.current = null;
            setStream(null);
          }
        }
      } catch (err) {
        log.error('Media error', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (mounted) {
          isProcessingStreamRef.current = false;
          if (pendingUpdateRef.current) {
            log.info('Executing pending manageStream update', {});
            pendingUpdateRef.current = false;
            manageStream();
          }
        }
      }
    };

    const timer = setTimeout(() => { manageStream(); }, 500);
    return () => { mounted = false; clearTimeout(timer); };
  }, [
    desiredMediaState.isMicrophoneEnabled,
    desiredMediaState.isCameraEnabled,
    desiredMediaState.isScreenShareEnabled,
    cameraSettings.selectedCameraId,
    audioSettings.selectedMicrophoneId,
    audioSettings.noiseReduction,
    audioSettings.noiseReductionLevel,
    audioSettings.echoCancellation,
    audioSettings.autoGainControl,
    crearAudioProcesado,
    limpiarAudioProcesado,
  ]);

  // ========== Screen share toggle ==========
  const handleToggleScreenShare = useCallback(async () => {
    if (!desiredMediaState.isScreenShareEnabled) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15 } },
          audio: false,
        });
        displayStream.getVideoTracks()[0].onended = () => {
          setScreenShareDesiredState(false);
          if (activeScreenRef.current) {
            activeScreenRef.current.getTracks().forEach(t => t.stop());
            activeScreenRef.current = null;
            setScreenStream(null);
          }
        };
        activeScreenRef.current = displayStream;
        setScreenStream(displayStream);
        setScreenShareDesiredState(true);
      } catch (err) {
        log.error('Screen share error', { error: err instanceof Error ? err.message : String(err) });
        setScreenShareDesiredState(false);
      }
    } else {
      if (activeScreenRef.current) {
        activeScreenRef.current.getTracks().forEach(t => t.stop());
        activeScreenRef.current = null;
        setScreenStream(null);
      }
      setScreenShareDesiredState(false);
    }
  }, [desiredMediaState.isScreenShareEnabled, setScreenShareDesiredState]);

  return {
    stream,
    setStream,
    screenStream,
    setScreenStream,
    activeStreamRef,
    activeScreenRef,
    handleToggleScreenShare,
    crearAudioProcesado,
    limpiarAudioProcesado,
  };
}
