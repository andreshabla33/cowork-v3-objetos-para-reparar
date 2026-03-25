/**
 * Hook para grabación de reuniones con MediaRecorder API
 * Sube archivos a Supabase Storage y guarda metadata
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { RecordingState, RecordingStatus, RecordingConfig, RecordingMetadata } from './types';

interface UseRecordingOptions {
  espacioId: string;
  reunionId?: string;
  userId: string;
  userName?: string;
  onRecordingStart?: () => void;
  onRecordingStop?: (metadata: RecordingMetadata) => void;
  onError?: (error: string) => void;
}

const DEFAULT_CONFIG: RecordingConfig = {
  includeVideo: true,
  includeAudio: true,
  includeScreenShare: false,
  maxDurationSeconds: 3600,
  mimeType: 'video/webm;codecs=vp9,opus',
};

export function useRecording(options: UseRecordingOptions) {
  const { espacioId, reunionId, userId, userName, onRecordingStart, onRecordingStop, onError } = options;

  const [state, setState] = useState<RecordingState>({
    status: 'idle',
    duration: 0,
    error: null,
    metadata: null,
    blob: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const updateStatus = useCallback((status: RecordingStatus) => {
    setState(prev => ({ ...prev, status }));
  }, []);

  const startRecording = useCallback(async (
    audioStream?: MediaStream,
    videoStream?: MediaStream,
    config: RecordingConfig = DEFAULT_CONFIG
  ) => {
    try {
      updateStatus('requesting_consent');
      chunksRef.current = [];

      let combinedStream: MediaStream;

      if (audioStream || videoStream) {
        const tracks: MediaStreamTrack[] = [];
        if (audioStream) tracks.push(...audioStream.getAudioTracks());
        if (videoStream) tracks.push(...videoStream.getVideoTracks());
        combinedStream = new MediaStream(tracks);
      } else {
        throw new Error('No hay stream inyectado para grabación. Usa el stream compartido de la reunión.');
      }

      streamRef.current = combinedStream;

      const mimeType = MediaRecorder.isTypeSupported(config.mimeType || DEFAULT_CONFIG.mimeType!)
        ? config.mimeType
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState(prev => ({ ...prev, blob }));
        await uploadRecording(blob);
      };

      mediaRecorder.onerror = (event: any) => {
        const errorMsg = event.error?.message || 'Error en la grabación';
        setState(prev => ({ ...prev, status: 'error', error: errorMsg }));
        onError?.(errorMsg);
      };

      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();

      const metadata: RecordingMetadata = {
        id: crypto.randomUUID(),
        reunion_id: reunionId,
        espacio_id: espacioId,
        creado_por: userId,
        duracion_segundos: 0,
        formato: mimeType || 'video/webm',
        estado: 'recording',
        progreso_porcentaje: 0,
        tipo: config.includeVideo ? 'reunion' : 'audio_solo',
        tiene_video: config.includeVideo,
        tiene_audio: config.includeAudio,
        inicio_grabacion: new Date().toISOString(),
      };

      await supabase.from('grabaciones').insert(metadata);

      mediaRecorder.start(1000);
      updateStatus('recording');
      setState(prev => ({ ...prev, metadata }));

      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setState(prev => ({ ...prev, duration: elapsed }));

        if (config.maxDurationSeconds && elapsed >= config.maxDurationSeconds) {
          stopRecording();
        }
      }, 1000);

      onRecordingStart?.();
      console.log('🔴 Grabación iniciada');

    } catch (err: any) {
      const errorMsg = err.message || 'Error al iniciar grabación';
      setState(prev => ({ ...prev, status: 'error', error: errorMsg }));
      onError?.(errorMsg);
    }
  }, [espacioId, reunionId, userId, onRecordingStart, onError, updateStatus]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      updateStatus('paused');
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      console.log('⏸️ Grabación pausada');
    }
  }, [updateStatus]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      updateStatus('recording');
      
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setState(prev => ({ ...prev, duration: elapsed }));
      }, 1000);
      
      console.log('▶️ Grabación reanudada');
    }
  }, [updateStatus]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      updateStatus('stopped');
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      console.log('⏹️ Grabación detenida');
    }
  }, [updateStatus]);

  const uploadRecording = useCallback(async (blob: Blob) => {
    try {
      updateStatus('uploading');
      
      const { metadata } = state;
      if (!metadata) return;

      const fileName = `${metadata.id}.webm`;
      const filePath = `${espacioId}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('grabaciones')
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('grabaciones')
        .getPublicUrl(filePath);

      const updatedMetadata: Partial<RecordingMetadata> = {
        archivo_url: publicUrl,
        archivo_nombre: fileName,
        duracion_segundos: state.duration,
        tamano_bytes: blob.size,
        estado: 'processing',
        fin_grabacion: new Date().toISOString(),
      };

      await supabase
        .from('grabaciones')
        .update(updatedMetadata)
        .eq('id', metadata.id);

      setState(prev => ({
        ...prev,
        status: 'processing',
        metadata: { ...prev.metadata!, ...updatedMetadata },
      }));

      onRecordingStop?.({ ...metadata, ...updatedMetadata } as RecordingMetadata);
      console.log('✅ Grabación subida:', publicUrl);

    } catch (err: any) {
      const errorMsg = err.message || 'Error al subir grabación';
      setState(prev => ({ ...prev, status: 'error', error: errorMsg }));
      onError?.(errorMsg);
    }
  }, [state, espacioId, onRecordingStop, onError, updateStatus]);

  const getAudioStream = useCallback((): MediaStream | null => {
    return streamRef.current;
  }, []);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    state,
    status: state.status,
    duration: state.duration,
    isRecording: state.status === 'recording',
    isPaused: state.status === 'paused',
    metadata: state.metadata,
    blob: state.blob,
    error: state.error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    getAudioStream,
  };
}

export default useRecording;
