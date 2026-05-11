/**
 * @module hooks/meetings/useRecordingV2
 * @description Orchestration hook para RecordingManagerV2.
 *
 * Encapsula la state machine (idle → selecting_type → recording → stopping →
 * processing → complete/error), el lifecycle de MediaRecorder (configurar,
 * start/stop/onstop), la coordinación con useTranscription + useCombinedAnalysis,
 * y la persistencia vía recordingRepository (singleton del Clean Arch port).
 *
 * Clean Architecture: este hook es el adapter delgado entre React state y
 * los use cases / repositorios ya extraídos a Application + Infrastructure
 * (IRecordingRepository.crearGrabacion / completarGrabacion / guardarTranscripcion
 * / guardarAnalisisComportamiento / generarResumenAI / crearNotificacionAnalisis
 * / marcarGrabacionError).
 *
 * Tamaño relajado vs ≤100L del skill: este hook es orchestration con lógica
 * pura ya delegada a Application/Infrastructure (mismo razonamiento que ITEM 7
 * fase A para los sub-hooks LiveKit). El tamaño viene del wiring inevitable
 * (state + refs + listeners + cleanup paths).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { recordingRepository } from '@/core/infrastructure/adapters/RecordingSupabaseRepository';
import { useAuthSessionGetter } from '@/hooks/auth/useAuthSession';
import { useTranscription } from '@/modules/meetings/presentation/recording/useTranscription';
import {
  useCombinedAnalysis,
  type AnalisisResumenTiempoReal,
} from '@/modules/meetings/presentation/recording/useCombinedAnalysis';
import {
  type TipoGrabacionDetallado,
  CONFIGURACIONES_GRABACION_DETALLADO,
  type ResultadoAnalisis,
} from '@/modules/meetings/presentation/recording/types/analysis';

export interface ProcessingState {
  step: 'idle' | 'selecting_type' | 'recording' | 'stopping' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  duration: number;
}

export interface UseRecordingV2Params {
  espacioId: string;
  userId: string;
  userName: string;
  reunionTitulo?: string;
  stream: MediaStream | null;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onProcessingComplete?: (resultado: ResultadoAnalisis | null) => void;
}

export interface UseRecordingV2Return {
  processingState: ProcessingState;
  tipoGrabacion: TipoGrabacionDetallado | null;
  showTypeSelector: boolean;
  setShowTypeSelector: (open: boolean) => void;
  showDashboard: boolean;
  resultado: ResultadoAnalisis | null;
  resumenTiempoReal: AnalisisResumenTiempoReal | null;
  isRecording: boolean;
  config: (typeof CONFIGURACIONES_GRABACION_DETALLADO)[TipoGrabacionDetallado] | null;
  handleRecordClick: () => void;
  handleTypeSelect: (tipo: TipoGrabacionDetallado, analisis: boolean) => void;
  stopRecording: () => Promise<void>;
  closeDashboard: () => void;
  closeError: () => void;
  exportResult: () => void;
  formatDuration: (seconds: number) => string;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export function useRecordingV2(params: UseRecordingV2Params): UseRecordingV2Return {
  const {
    espacioId,
    userId,
    userName,
    reunionTitulo,
    stream,
    onRecordingStateChange,
    onProcessingComplete,
  } = params;

  const getAuthSession = useAuthSessionGetter();

  // Estados principales
  const [processingState, setProcessingState] = useState<ProcessingState>({
    step: 'idle',
    progress: 0,
    message: '',
    duration: 0,
  });
  const [tipoGrabacion, setTipoGrabacion] = useState<TipoGrabacionDetallado | null>(null);
  const [, setConAnalisis] = useState<boolean>(true);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null);
  const [resumenTiempoReal, setResumenTiempoReal] = useState<AnalisisResumenTiempoReal | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const grabacionIdRef = useRef<string>('');
  const transcriptRef = useRef<string>('');
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const isRecording = processingState.step === 'recording';
  const config = tipoGrabacion ? CONFIGURACIONES_GRABACION_DETALLADO[tipoGrabacion] : null;

  // Hook de transcripción
  const {
    startTranscription,
    stopTranscription,
    transcribeAudioBlob,
    fullTranscript,
    segments,
  } = useTranscription({
    grabacionId: grabacionIdRef.current || 'pending',
    idioma: 'es',
    onFullTranscriptUpdate: (text) => {
      transcriptRef.current = text;
    },
  });

  // Tipo base para el hook de análisis (rrhh_entrevista y rrhh_one_to_one -> rrhh)
  const tipoBase = tipoGrabacion
    ? CONFIGURACIONES_GRABACION_DETALLADO[tipoGrabacion].tipoBase
    : 'equipo';

  // Hook de análisis combinado
  const combinedAnalysis = useCombinedAnalysis({
    tipoGrabacion: tipoBase,
    grabacionId: grabacionIdRef.current || 'pending',
    participantes: [{ id: userId, nombre: userName }],
    onAnalisisUpdate: (resumen) => {
      setResumenTiempoReal(resumen);
    },
  });

  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    setProcessingState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Auto-clear error
  useEffect(() => {
    if (processingState.step === 'error') {
      const timer = setTimeout(() => {
        updateState({ step: 'idle', message: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [processingState.step, updateState]);

  useEffect(() => {
    if (stream && processingState.step === 'error' && processingState.message.includes('stream')) {
      updateState({ step: 'idle', message: '' });
    }
  }, [stream, processingState.step, processingState.message, updateState]);

  const findVideoElement = useCallback((): HTMLVideoElement | null => {
    if (!stream) return null;
    const videoElements = document.querySelectorAll('video');
    for (const video of videoElements) {
      if (video.srcObject === stream) {
        return video as HTMLVideoElement;
      }
    }
    return null;
  }, [stream]);

  // Procesar grabación (definido primero — referenciado en startRecording.recorder.onstop)
  const processRecording = useCallback(async () => {
    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      console.log('📊 Duración calculada:', duration, 'segundos');

      updateState({ step: 'processing', progress: 20, message: 'Procesando transcripción...' });

      // Transcript fallback chain: ref → fullTranscript → segments → transcribe blob
      let transcript = transcriptRef.current;
      if (!transcript || transcript.trim().length < 20) {
        transcript = fullTranscript;
      }
      if ((!transcript || transcript.trim().length < 20) && segments && segments.length > 0) {
        transcript = segments.map((s) => s.texto).join(' ');
      }
      if (!transcript || transcript.trim().length < 20) {
        try {
          transcript = (await transcribeAudioBlob(blob)) || '';
        } catch (err) {
          console.warn('⚠️ Error transcribiendo blob:', err);
        }
      }
      if (!transcript || transcript.trim().length < 10) {
        transcript = `[Grabación de ${Math.round(duration / 60)} minutos - transcripción no disponible]`;
      }

      updateState({ progress: 40, message: 'Generando análisis conductual...' });
      const resultadoAnalisis = combinedAnalysis.getResultadoCompleto();

      updateState({ progress: 50, message: 'Guardando transcripción...' });
      if (transcript && transcript.trim().length > 0) {
        try {
          await recordingRepository.guardarTranscripcion({
            grabacion_id: grabacionIdRef.current,
            texto: transcript,
            inicio_segundos: 0,
            fin_segundos: duration,
            speaker_id: userId,
            speaker_nombre: userName,
            confianza: 0.9,
            idioma: 'es',
          });
        } catch (transcError) {
          console.error('Error guardando transcripción:', transcError);
        }
      }

      updateState({ progress: 70, message: 'Guardando análisis conductual...' });
      const emotionFrames = resultadoAnalisis.frames_faciales;
      if (emotionFrames.length > 0) {
        const emotionRecords = emotionFrames
          .filter((_, i) => i % 5 === 0)
          .map((e) => ({
            id: crypto.randomUUID(),
            grabacion_id: grabacionIdRef.current,
            timestamp_segundos: e.timestamp_segundos,
            emocion_dominante: e.emocion_dominante,
            engagement_score: e.engagement_score,
            participante_id: userId,
            participante_nombre: userName,
          }));
        try {
          await recordingRepository.guardarAnalisisComportamiento(emotionRecords);
        } catch (analisisError) {
          console.error('Error guardando análisis:', analisisError);
        }
      }

      updateState({ progress: 80, message: 'Generando resumen AI...' });
      const avgEngagement = emotionFrames.length > 0
        ? emotionFrames.reduce((sum, f) => sum + f.engagement_score, 0) / emotionFrames.length
        : 0.5;

      const accessToken = getAuthSession().accessToken ?? undefined;
      if (accessToken) {
        try {
          await recordingRepository.generarResumenAI({
            grabacion_id: grabacionIdRef.current,
            espacio_id: espacioId,
            creador_id: userId,
            transcripcion: transcript,
            emociones: emotionFrames.slice(-50),
            duracion_segundos: duration,
            participantes: [userName],
            reunion_titulo: reunionTitulo,
            tipo_grabacion: tipoGrabacion,
            metricas_adicionales: {
              engagement_promedio: avgEngagement,
              microexpresiones_detectadas: resultadoAnalisis.microexpresiones.length,
              tipo_analisis: tipoGrabacion,
            },
          });
        } catch (aiError) {
          console.warn('⚠️ Error generando resumen AI:', aiError instanceof Error ? aiError.message : String(aiError));
        }
      }

      await recordingRepository.completarGrabacion(grabacionIdRef.current, {
        estado: 'completado',
        duracion_segundos: duration,
        fin_grabacion: new Date().toISOString(),
        archivo_nombre: reunionTitulo || `Reunión ${new Date().toLocaleDateString('es-ES')}`,
      });

      setResultado(resultadoAnalisis);
      setShowDashboard(true);
      updateState({ step: 'complete', progress: 100, message: '¡Análisis completado!' });
      onProcessingComplete?.(resultadoAnalisis);

      const titulo = tipoGrabacion ? CONFIGURACIONES_GRABACION_DETALLADO[tipoGrabacion].titulo : 'reunión';
      await recordingRepository.crearNotificacionAnalisis({
        usuario_id: userId,
        espacio_id: espacioId,
        tipo: 'analisis_listo',
        titulo: `📊 Análisis de ${titulo} listo`,
        mensaje: reunionTitulo
          ? `El análisis de "${reunionTitulo}" está disponible`
          : 'El análisis de tu reunión está disponible',
        entidad_tipo: 'grabacion',
        entidad_id: grabacionIdRef.current,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en el procesamiento';
      console.error('Error procesando grabación:', err);
      updateState({ step: 'error', message });
      await recordingRepository.marcarGrabacionError(grabacionIdRef.current, {
        estado: 'error',
        error_mensaje: message,
      });
    }
  }, [
    updateState,
    onProcessingComplete,
    combinedAnalysis,
    transcribeAudioBlob,
    fullTranscript,
    segments,
    userId,
    userName,
    espacioId,
    reunionTitulo,
    tipoGrabacion,
    getAuthSession,
  ]);

  // Iniciar grabación
  const startRecording = useCallback(async (tipo: TipoGrabacionDetallado, _analisis: boolean = true) => {
    if (!stream) {
      updateState({ step: 'error', message: 'No hay stream de audio/video disponible' });
      return;
    }

    try {
      chunksRef.current = [];
      transcriptRef.current = '';
      grabacionIdRef.current = crypto.randomUUID();

      const videoEl = findVideoElement();
      if (videoEl) {
        videoElementRef.current = videoEl;
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        processRecording();
      };

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();

      await recordingRepository.crearGrabacion({
        id: grabacionIdRef.current,
        espacio_id: espacioId,
        creado_por: userId,
        estado: 'grabando',
        inicio_grabacion: new Date().toISOString(),
        tipo: tipo,
        tiene_video: true,
        tiene_audio: true,
        formato: 'webm',
      });

      recorder.start(1000);

      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        updateState({ duration: elapsed });
      }, 1000);

      updateState({
        step: 'recording',
        progress: 0,
        message: `Grabando ${CONFIGURACIONES_GRABACION_DETALLADO[tipo].titulo}...`,
        duration: 0,
      });
      onRecordingStateChange?.(true);

      // Iniciar transcripción
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks);
        startTranscription(audioStream).catch((err) => {
          console.warn('⚠️ Transcripción en tiempo real no disponible:', err.message);
        });
      }

      // Iniciar análisis combinado
      if (videoElementRef.current) {
        await combinedAnalysis.startAnalysis(videoElementRef.current);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar grabación';
      console.error('Error iniciando grabación:', err);
      updateState({ step: 'error', message });
    }
  }, [stream, espacioId, userId, updateState, onRecordingStateChange, startTranscription, findVideoElement, combinedAnalysis, processRecording]);

  // Detener grabación
  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      updateState({ step: 'stopping', message: 'Deteniendo grabación...' });

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      const finalTranscript = await stopTranscription();
      if (finalTranscript && finalTranscript.length > 0) {
        transcriptRef.current = finalTranscript;
      }

      combinedAnalysis.stopAnalysis();
      mediaRecorderRef.current.stop();
      onRecordingStateChange?.(false);
    }
  }, [updateState, onRecordingStateChange, stopTranscription, combinedAnalysis]);

  const handleRecordClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      setShowTypeSelector(true);
    }
  }, [isRecording, stopRecording]);

  const handleTypeSelect = useCallback((tipo: TipoGrabacionDetallado, analisis: boolean) => {
    setTipoGrabacion(tipo);
    setConAnalisis(analisis);
    setShowTypeSelector(false);
    startRecording(tipo, analisis);
  }, [startRecording]);

  const closeDashboard = useCallback(() => {
    setShowDashboard(false);
    setResultado(null);
    setTipoGrabacion(null);
    updateState({ step: 'idle', progress: 0, message: '', duration: 0 });
  }, [updateState]);

  const closeError = useCallback(() => {
    updateState({ step: 'idle', message: '' });
  }, [updateState]);

  const exportResult = useCallback(() => {
    if (!resultado) return;
    const json = JSON.stringify(resultado, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisis_${resultado.tipo_grabacion}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultado]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
    };
  }, []);

  return {
    processingState,
    tipoGrabacion,
    showTypeSelector,
    setShowTypeSelector,
    showDashboard,
    resultado,
    resumenTiempoReal,
    isRecording,
    config,
    handleRecordClick,
    handleTypeSelect,
    stopRecording,
    closeDashboard,
    closeError,
    exportResult,
    formatDuration,
  };
}
