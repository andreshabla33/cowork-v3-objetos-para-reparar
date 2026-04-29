/**
 * RecordingManager - Componente de grabación con análisis conductual avanzado
 *
 * Características:
 * - Selector de tipo: RRHH, Deals, Equipo
 * - Disclaimer condicional (solo RRHH)
 * - Análisis facial avanzado con microexpresiones
 * - Análisis de lenguaje corporal
 * - Predicciones de comportamiento
 * - Dashboard específico por tipo
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '@/lib/logger';
import type { RecordingDiagnosticsSnapshot } from '@/modules/realtime-room';
import { useRecordingManager } from '@/hooks/meetings/useRecordingManager';
import { useTranscription } from './useTranscription';
import { useCombinedAnalysis, AnalisisResumenTiempoReal } from './useCombinedAnalysis';
import { RecordingTypeSelectorV2 } from './RecordingTypeSelectorV2';
import { AnalysisDashboard } from './AnalysisDashboard';
import {
  TipoGrabacionDetallado,
  CargoLaboral,
  CONFIGURACIONES_GRABACION_DETALLADO,
  getConfiguracionConMetricasCustom,
  ResultadoAnalisis,
  tienePermisoAnalisis,
} from './types/analysis';

const log = logger.child('recording-manager');

interface UsuarioEnLlamada {
  id: string;
  nombre: string;
}

interface RecordingManagerProps {
  espacioId: string;
  userId: string;
  userName: string;
  reunionTitulo?: string;
  stream: MediaStream | null;
  cargoUsuario?: CargoLaboral;
  usuariosEnLlamada?: UsuarioEnLlamada[]; // Usuarios en la llamada para seleccionar evaluado
  canStartRecording?: boolean;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onProcessingComplete?: (resultado: ResultadoAnalisis | null) => void;
  onDurationChange?: (duration: number) => void;
  onTipoGrabacionChange?: (tipo: string | null) => void;
  onDiagnosticsSnapshotChange?: (snapshot: RecordingDiagnosticsSnapshot) => void;
  headlessMode?: boolean;
  externalTrigger?: boolean;
  onExternalTriggerHandled?: () => void;
  preselectedTipoGrabacion?: TipoGrabacionDetallado; // Auto-seleccionar tipo (saltar selector)
  onRequestGuestConsent?: (guestName: string, guestEmail: string, grabacionId: string) => void;
}

interface ProcessingState {
  step: 'idle' | 'selecting_type' | 'recording' | 'stopping' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  duration: number;
}

interface RecordingPreset {
  mimeType?: string;
  includeBitrates: boolean;
  useTimeslice: boolean;
}

const getRecordingPresets = (stream: MediaStream): RecordingPreset[] => {
  const hasVideo = stream.getVideoTracks().length > 0;
  const hasAudio = stream.getAudioTracks().length > 0;
  const mimeCandidates = hasVideo
    ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
    ]
    : hasAudio
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'video/mp4']
      : ['video/webm', 'video/mp4'];

  const presets: RecordingPreset[] = [];
  mimeCandidates.forEach((mimeType) => {
    if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
      presets.push({ mimeType, includeBitrates: true, useTimeslice: true });
      presets.push({ mimeType, includeBitrates: false, useTimeslice: true });
      presets.push({ mimeType, includeBitrates: false, useTimeslice: false });
    }
  });

  presets.push({ includeBitrates: false, useTimeslice: true });
  presets.push({ includeBitrates: false, useTimeslice: false });
  return presets;
};

/**
 * Validate if a string is a valid UUID
 */
const isValidUUID = (id: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

export const RecordingManager: React.FC<RecordingManagerProps> = ({
  espacioId,
  userId,
  userName,
  reunionTitulo,
  stream,
  cargoUsuario = 'colaborador',
  usuariosEnLlamada = [],
  canStartRecording = true,
  onRecordingStateChange,
  onExternalTriggerHandled,
  headlessMode,
  externalTrigger,
  onProcessingComplete,
  onDurationChange,
  onTipoGrabacionChange,
  onDiagnosticsSnapshotChange,
  preselectedTipoGrabacion,
  onRequestGuestConsent,
}) => {
  // Hook for recording operations
  const recordingOps = useRecordingManager();

  // Estados principales
  const [processingState, setProcessingState] = useState<ProcessingState>({
    step: 'idle',
    progress: 0,
    message: '',
    duration: 0,
  });
  const [tipoGrabacion, setTipoGrabacion] = useState<TipoGrabacionDetallado | null>(null);
  const [conAnalisis, setConAnalisis] = useState<boolean>(true);
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
  const recordingMimeTypeRef = useRef<string>('video/webm');

  const isRecording = processingState.step === 'recording';
  const config = tipoGrabacion ? getConfiguracionConMetricasCustom(tipoGrabacion) : null;

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

  // Obtener tipo base para el hook de análisis (rrhh_entrevista y rrhh_one_to_one -> rrhh)
  const tipoBase = tipoGrabacion
    ? CONFIGURACIONES_GRABACION_DETALLADO[tipoGrabacion].tipoBase
    : 'equipo';

  // Hook de análisis combinado (se inicializa cuando se selecciona tipo)
  const combinedAnalysis = useCombinedAnalysis({
    tipoGrabacion: tipoBase,
    grabacionId: grabacionIdRef.current || 'pending',
    participantes: [{ id: userId, nombre: userName }],
    onAnalisisUpdate: (resumen) => {
      setResumenTiempoReal(resumen);
    },
  });

  // Actualizar estado
  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    setProcessingState(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    onDiagnosticsSnapshotChange?.({
      step: processingState.step,
      message: processingState.message,
      duration: processingState.duration,
      hasStream: Boolean(stream),
      canStartRecording,
    });
  }, [canStartRecording, onDiagnosticsSnapshotChange, processingState.duration, processingState.message, processingState.step, stream]);

  // Limpiar error automáticamente después de 5 segundos o cuando el stream esté disponible
  useEffect(() => {
    if (processingState.step === 'error') {
      const timer = setTimeout(() => {
        updateState({ step: 'idle', message: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [processingState.step, updateState]);

  // Limpiar error cuando el stream esté disponible
  useEffect(() => {
    if (stream && processingState.step === 'error' && processingState.message.includes('stream')) {
      updateState({ step: 'idle', message: '' });
    }
  }, [stream, processingState.step, processingState.message, updateState]);

  // Buscar o crear elemento de video para análisis conductual
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);

  const findVideoElement = useCallback((): HTMLVideoElement | null => {
    if (!stream) return null;

    // Primero buscar en el DOM un video con nuestro stream
    const videoElements = document.querySelectorAll('video');
    for (const video of videoElements) {
      if (video.srcObject === stream) {
        return video as HTMLVideoElement;
      }
    }

    // En LiveKit los videos se renderizan internamente,
    // así que creamos un video oculto para el análisis facial/corporal
    if (!hiddenVideoRef.current) {
      const hiddenVideo = document.createElement('video');
      hiddenVideo.style.position = 'absolute';
      hiddenVideo.style.width = '1px';
      hiddenVideo.style.height = '1px';
      hiddenVideo.style.opacity = '0.01';
      hiddenVideo.style.pointerEvents = 'none';
      hiddenVideo.style.zIndex = '-1';
      hiddenVideo.setAttribute('playsinline', 'true');
      hiddenVideo.setAttribute('autoplay', 'true');
      hiddenVideo.muted = true;
      document.body.appendChild(hiddenVideo);
      hiddenVideoRef.current = hiddenVideo;
    }

    // Asignar el stream al video oculto
    if (hiddenVideoRef.current.srcObject !== stream) {
      hiddenVideoRef.current.srcObject = stream;
      hiddenVideoRef.current.play().catch(() => {});
    }

    log.debug('Hidden video element created for behavioral analysis');
    return hiddenVideoRef.current;
  }, [stream]);

  // Limpiar video oculto al desmontar
  useEffect(() => {
    return () => {
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = null;
        hiddenVideoRef.current.remove();
        hiddenVideoRef.current = null;
      }
    };
  }, []);

  // Iniciar grabación
  const startRecording = useCallback(async (tipo: TipoGrabacionDetallado, analisis: boolean = true, evaluadoId?: string, evaluadoNombre?: string, evaluadoEmail?: string) => {
    if (!canStartRecording) {
      updateState({ step: 'error', message: 'La grabación solo se habilita cuando hay al menos 2 personas en la reunión' });
      return;
    }

    if (!stream) {
      updateState({ step: 'error', message: 'No hay stream de audio/video disponible' });
      return;
    }

    try {
      // Inicializar refs
      chunksRef.current = [];
      transcriptRef.current = '';
      grabacionIdRef.current = crypto.randomUUID();

      // Buscar video element
      const videoEl = findVideoElement();
      if (videoEl) {
        videoElementRef.current = videoEl;
      }

      const recordableTracks = [
        ...stream.getVideoTracks().filter((track) => track.readyState === 'live'),
        ...stream.getAudioTracks().filter((track) => track.readyState === 'live'),
      ];

      if (recordableTracks.length === 0) {
        throw new Error('No encontramos tracks activos para iniciar la grabación.');
      }

      const recordingStream = new MediaStream(recordableTracks);

      let recorder: MediaRecorder | null = null;
      let resolvedMimeType = recordingStream.getVideoTracks().length > 0 ? 'video/webm' : 'audio/webm';
      let lastRecorderError: unknown = null;

      for (const preset of getRecordingPresets(recordingStream)) {
        try {
          const recorderOptions: MediaRecorderOptions = {};
          if (preset.mimeType) {
            recorderOptions.mimeType = preset.mimeType;
          }
          if (preset.includeBitrates && recordingStream.getVideoTracks().length > 0) {
            recorderOptions.videoBitsPerSecond = 2500000;
          }
          if (preset.includeBitrates && recordingStream.getAudioTracks().length > 0) {
            recorderOptions.audioBitsPerSecond = 128000;
          }

          const candidateRecorder = new MediaRecorder(recordingStream, recorderOptions);
          candidateRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };
          candidateRecorder.onstop = () => {
            processRecording();
          };
          candidateRecorder.onerror = () => undefined;

          if (preset.useTimeslice) {
            candidateRecorder.start(1000);
          } else {
            candidateRecorder.start();
          }
          recorder = candidateRecorder;
          resolvedMimeType = candidateRecorder.mimeType || preset.mimeType || resolvedMimeType;
          break;
        } catch (recorderError) {
          lastRecorderError = recorderError;
        }
      }

      if (!recorder) {
        throw lastRecorderError instanceof Error
          ? lastRecorderError
          : new Error('Tu navegador no pudo iniciar la grabación con la configuración de media actual.');
      }

      mediaRecorderRef.current = recorder;
      recordingMimeTypeRef.current = resolvedMimeType;
      startTimeRef.current = Date.now();

      // Crear grabación en BD usando el hook
      log.info('Creating recording in database', { espacioId, userId });
      try {
        await recordingOps.crearGrabacion({
          grabacionId: grabacionIdRef.current,
          espacioId,
          userId,
          tipo,
          formato: resolvedMimeType,
          evaluadoId: (evaluadoId && isValidUUID(evaluadoId)) ? evaluadoId : null,
          evaluadoNombre: evaluadoNombre || null,
          evaluadoEmail: evaluadoEmail || null,
        });
        log.info('Recording created successfully', { grabacionId: grabacionIdRef.current });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to create recording', { error: message });
        updateState({ step: 'error', message: `Error creando grabación: ${message}` });
        return;
      }

      // Si hay evaluado con UUID válido, enviar solicitud de consentimiento
      if (evaluadoId && isValidUUID(evaluadoId)) {
        log.debug('Requesting consent from evaluated user', { evaluadoId, tipo });
        try {
          await recordingOps.solicitarConsentimiento(grabacionIdRef.current, evaluadoId, tipo);
          log.info('Consent request sent', { evaluadoId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Failed to request consent', { error: message });
        }
      } else if (evaluadoId && evaluadoNombre) {
        // Invitado externo: solicitar consentimiento via DataChannel
        log.debug('External guest evaluated, requesting consent via DataChannel', { evaluadoNombre, evaluadoEmail });
        onRequestGuestConsent?.(evaluadoNombre, evaluadoEmail || '', grabacionIdRef.current);
      }

      // Registrar al grabador como participante
      log.debug('Registering recorder as participant', { grabacionId: grabacionIdRef.current, userId });
      try {
        await recordingOps.registrarParticipante({
          grabacionId: grabacionIdRef.current,
          userId,
          userName,
        });
        log.info('Participant registered', { userId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to register participant', { error: message });
      }

      // Timer de duración
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        updateState({ duration: elapsed });
        onDurationChange?.(elapsed); // Notificar al padre
      }, 1000);

      updateState({
        step: 'recording',
        progress: 0,
        message: `Grabando ${CONFIGURACIONES_GRABACION_DETALLADO[tipo].titulo}...`,
        duration: 0
      });
      onRecordingStateChange?.(true);
      onTipoGrabacionChange?.(tipo); // Notificar el tipo para el banner

      // Iniciar transcripción
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks);
        startTranscription(audioStream).catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Real-time transcription not available', { error: message });
        });
      }

      // Iniciar análisis combinado (facial + corporal)
      if (videoElementRef.current) {
        await combinedAnalysis.startAnalysis(videoElementRef.current);
      }

      log.info('Recording started', { tipo });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : undefined;
      log.error('Error starting recording', { error: message, errorName });
      updateState({
        step: 'error',
        message: errorName === 'NotSupportedError'
          ? 'Tu navegador no pudo iniciar la grabación con la configuración actual. Intenta nuevamente con la cámara o el micrófono reiniciados.'
          : message || 'Error al iniciar grabación',
      });
    }
  }, [canStartRecording, stream, espacioId, userId, userName, updateState, onRecordingStateChange, onTipoGrabacionChange, startTranscription, findVideoElement, combinedAnalysis, recordingOps, onRequestGuestConsent]);

  // Detener grabación
  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      updateState({ step: 'stopping', message: 'Deteniendo grabación...' });

      // Limpiar timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Detener transcripción y capturar resultado
      const finalTranscript = await stopTranscription();
      if (finalTranscript && finalTranscript.length > 0) {
        transcriptRef.current = finalTranscript;
        log.debug('Final transcription captured', { length: finalTranscript.length });
      }

      // Detener análisis combinado
      combinedAnalysis.stopAnalysis();

      // Forzar último dataavailable antes de stop (fix: chunks vacíos)
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.debug('requestData failed (normal if already stopped)', { error: message });
      }

      // Esperar un tick para que el último chunk se procese antes de stop
      await new Promise(resolve => setTimeout(resolve, 200));

      // Detener MediaRecorder (dispara processRecording via onstop)
      if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
        mediaRecorderRef.current.stop();
      }
      onRecordingStateChange?.(false);

      log.info('Recording stopped');
    }
  }, [updateState, onRecordingStateChange, stopTranscription, combinedAnalysis]);

  // Manejar selección de tipo
  const handleTypeSelect = useCallback(async (tipo: TipoGrabacionDetallado, analisis: boolean, evaluadoId?: string, evaluadoNombre?: string, evaluadoEmail?: string) => {
    log.debug('Type selected', { tipo, analisis, evaluadoId, evaluadoNombre });
    setTipoGrabacion(tipo);
    setConAnalisis(analisis);
    setShowTypeSelector(false);
    await startRecording(tipo, analisis, evaluadoId, evaluadoNombre, evaluadoEmail);
  }, [startRecording]);

  // Manejar trigger externo
  useEffect(() => {
    if (externalTrigger && onExternalTriggerHandled) {
      if (isRecording) {
        stopRecording();
      } else if (preselectedTipoGrabacion) {
        // Si requiere disclaimer (RRHH), mostrar selector para elegir evaluado y aceptar
        const preConfig = CONFIGURACIONES_GRABACION_DETALLADO[preselectedTipoGrabacion];
        if (preConfig?.requiereDisclaimer) {
          log.debug('Preselected type requires disclaimer, showing selector', { tipo: preselectedTipoGrabacion });
          setShowTypeSelector(true);
        } else {
          log.debug('Auto-starting with preselected type', { tipo: preselectedTipoGrabacion });
          handleTypeSelect(preselectedTipoGrabacion, true);
        }
      } else {
        setShowTypeSelector(true);
      }
      onExternalTriggerHandled();
    }
  }, [externalTrigger, onExternalTriggerHandled, isRecording, stopRecording, preselectedTipoGrabacion, handleTypeSelect]);

  // Manejar selección de tipo de grabar
  const handleRecordClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (preselectedTipoGrabacion) {
      // Si requiere disclaimer (RRHH), mostrar selector para elegir evaluado
      const preConfig = CONFIGURACIONES_GRABACION_DETALLADO[preselectedTipoGrabacion];
      if (preConfig?.requiereDisclaimer) {
        setShowTypeSelector(true);
      } else {
        handleTypeSelect(preselectedTipoGrabacion, true);
      }
    } else {
      setShowTypeSelector(true);
    }
  }, [isRecording, stopRecording, preselectedTipoGrabacion, handleTypeSelect]);

  // Procesar grabación
  const processRecording = useCallback(async () => {
    try {
      const resolvedBlobType = chunksRef.current[0]?.type || recordingMimeTypeRef.current || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: resolvedBlobType });
      // Calcular duración desde startTimeRef (más confiable que el estado)
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      log.debug('Calculated recording duration', { duration });

      updateState({ step: 'processing', progress: 20, message: 'Procesando transcripción...' });

      // Obtener transcripción - intentar múltiples fuentes
      let transcript = transcriptRef.current;
      log.debug('Transcription from ref', { length: transcript?.length || 0 });

      // Si el ref está vacío, intentar desde fullTranscript del hook
      if (!transcript || transcript.trim().length < 20) {
        transcript = fullTranscript;
        log.debug('Transcription from fullTranscript', { length: transcript?.length || 0 });
      }

      // Si aún está vacío, intentar concatenar segments
      if (!transcript || transcript.trim().length < 20) {
        if (segments && segments.length > 0) {
          transcript = segments.map(s => s.texto).join(' ');
          log.debug('Transcription from segments', { length: transcript?.length || 0 });
        }
      }

      // Último recurso: transcribir el blob de audio
      if (!transcript || transcript.trim().length < 20) {
        log.debug('Attempting to transcribe audio blob');
        try {
          transcript = await transcribeAudioBlob(blob) || '';
          log.debug('Transcription from blob', { length: transcript?.length || 0 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Error transcribing blob', { error: message });
        }
      }

      // Si todo falla, usar placeholder informativo
      if (!transcript || transcript.trim().length < 10) {
        transcript = `[Grabación de ${Math.round(duration / 60)} minutos - transcripción no disponible]`;
        log.warn('Using placeholder for transcription');
      }

      updateState({ progress: 40, message: 'Generando análisis conductual...' });

      // Obtener resultado de análisis combinado
      const resultadoAnalisis = combinedAnalysis.getResultadoCompleto();

      updateState({ progress: 50, message: 'Guardando transcripción...' });

      // Guardar transcripción
      if (transcript && transcript.trim().length > 0) {
        log.debug('Saving transcription to database', { length: transcript.length });
        try {
          await recordingOps.guardarTranscripcion({
            grabacionId: grabacionIdRef.current,
            texto: transcript,
            duracion: duration,
            userId,
            userName,
          });
          log.info('Transcription saved successfully');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('Failed to save transcription', { error: message });
        }
      } else {
        log.debug('No transcription to save');
      }

      updateState({ progress: 70, message: 'Guardando análisis conductual...' });

      // Guardar análisis
      const emotionFrames = resultadoAnalisis.frames_faciales;
      if (emotionFrames.length > 0) {
        log.debug('Saving behavioral analysis', { frameCount: emotionFrames.length });
        try {
          await recordingOps.guardarAnalisis({
            grabacionId: grabacionIdRef.current,
            frames: emotionFrames.map(e => ({
              timestamp_segundos: e.timestamp_segundos,
              emocion_dominante: e.emocion_dominante,
              engagement_score: e.engagement_score,
            })),
            userId,
            userName,
          });
          log.info('Behavioral analysis saved successfully', { frameCount: emotionFrames.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('Failed to save behavioral analysis', { error: message });
        }
      } else {
        log.warn('No behavioral analysis frames to save');
      }

      updateState({ progress: 80, message: 'Generando resumen AI...' });

      // Generar resumen AI (con timeout para no bloquear)
      const avgEngagement = emotionFrames.length > 0
        ? emotionFrames.reduce((sum, f) => sum + f.engagement_score, 0) / emotionFrames.length
        : 0.5;

      try {
        log.debug('Generating AI summary', { grabacionId: grabacionIdRef.current, emotionFrameCount: emotionFrames.length });
        // Muestrear emociones uniformemente (máx 100 frames distribuidos en toda la grabación)
        const maxEmotionFrames = 100;
        const sampledEmotions = emotionFrames.length <= maxEmotionFrames
          ? emotionFrames
          : emotionFrames.filter((_, i) => i % Math.ceil(emotionFrames.length / maxEmotionFrames) === 0);

        try {
          await recordingOps.generarResumenAI({
            grabacionId: grabacionIdRef.current,
            espacioId,
            userId,
            transcripcion: transcript,
            emociones: sampledEmotions.map(e => ({
              timestamp_segundos: e.timestamp_segundos,
              emocion_dominante: e.emocion_dominante,
              engagement_score: e.engagement_score,
            })),
            duracion: duration,
            participantes: [userName],
            reunionTitulo,
            tipoGrabacion,
            engagementPromedio: avgEngagement,
            microexpresionesCount: resultadoAnalisis.microexpresiones.length,
            totalFrames: emotionFrames.length,
          });
          log.info('AI summary generated successfully');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Error generating AI summary, continuing', { error: message });
        }
      } catch (aiErr) {
        const message = aiErr instanceof Error ? aiErr.message : String(aiErr);
        log.warn('Error in AI process, continuing', { error: message });
      }

      // Completar grabación
      log.debug('Completing recording', { grabacionId: grabacionIdRef.current, duration });
      try {
        await recordingOps.completarGrabacion({
          grabacionId: grabacionIdRef.current,
          duracion: duration,
          archivoNombre: reunionTitulo || `Reunión ${new Date().toLocaleDateString('es-ES')}`,
        });
        log.info('Recording completed successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to complete recording', { error: message });
      }

      // Video procesado localmente - no se sube a storage por privacidad
      log.debug('Video processed locally (not uploaded to storage)');

      // Guardar resultado
      setResultado(resultadoAnalisis);
      setShowDashboard(true);
      updateState({ step: 'complete', progress: 100, message: '¡Análisis completado!' });
      onProcessingComplete?.(resultadoAnalisis);

      // Crear notificación
      log.debug('Creating analysis notification', { userId, grabacionId: grabacionIdRef.current });
      try {
        await recordingOps.crearNotificacion({
          userId,
          espacioId,
          titulo: `📊 Análisis de ${config?.titulo || 'reunión'} listo`,
          mensaje: reunionTitulo
            ? `El análisis de "${reunionTitulo}" está disponible`
            : 'El análisis de tu reunión está disponible',
          grabacionId: grabacionIdRef.current,
        });
        log.info('Notification created successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to create notification', { error: message });
      }

      log.info('Processing complete');

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error processing recording', { error: message });
      updateState({ step: 'error', message: message || 'Error en el procesamiento' });

      // Marcar grabación como error
      log.warn('Marking recording as error', { grabacionId: grabacionIdRef.current });
      try {
        await recordingOps.marcarError(grabacionIdRef.current, message || 'Error en procesamiento');
      } catch (markErr) {
        const markMessage = markErr instanceof Error ? markErr.message : String(markErr);
        log.error('Failed to mark recording as error', { error: markMessage });
      }
    }
  }, [
    processingState.duration,
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
    config,
    recordingOps,
  ]);

  // Formatear duración
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Cleanup
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

  return (
    <>
      {/* Selector de tipo con permisos por cargo */}
      <RecordingTypeSelectorV2
        isOpen={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        onSelect={handleTypeSelect}
        cargoUsuario={cargoUsuario}
        usuariosEnLlamada={usuariosEnLlamada}
        currentUserId={userId}
        preselectedType={preselectedTipoGrabacion}
      />

      {/* Dashboard de resultados */}
      {showDashboard && resultado && (
        <AnalysisDashboard
          resultado={resultado}
          onClose={() => {
            setShowDashboard(false);
            setResultado(null);
            setTipoGrabacion(null);
            updateState({ step: 'idle', progress: 0, message: '', duration: 0 });
          }}
          onExport={() => {
            const json = JSON.stringify(resultado, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analisis_${resultado.tipo_grabacion}_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}

      {/* Modal de procesamiento */}
      {(processingState.step === 'stopping' || processingState.step === 'processing') && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-blue-600/30 rounded-full"></div>
                <div
                  className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">🧠</span>
                </div>
              </div>

              <h3 className="text-white font-bold text-lg mb-2">Procesando Análisis</h3>
              <p className="text-white/70 text-sm mb-4">{processingState.message}</p>

              <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${processingState.progress}%` }}
                ></div>
              </div>
              <p className="text-white/50 text-xs">{processingState.progress}% completado</p>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {processingState.step === 'error' && (
        <div className="fixed top-24 right-4 z-[301] animate-slide-in">
          <div className="bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-sm">Error en procesamiento</p>
              <p className="text-xs opacity-80">{processingState.message}</p>
            </div>
            <button
              onClick={() => updateState({ step: 'idle', message: '' })}
              className="ml-2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Indicadores en tiempo real durante grabación */}
      {isRecording && resumenTiempoReal && (
        <div className="fixed bottom-24 left-4 z-[200] space-y-2">
          {/* Badge de tipo */}
          {config && (
            <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${config.color} text-white text-sm font-medium flex items-center gap-2 shadow-lg`}>
              <span>{config.icono}</span>
              <span>{config.titulo}</span>
            </div>
          )}

          {/* Métricas en tiempo real */}
          <div className="bg-zinc-900/90 backdrop-blur rounded-xl p-3 border border-white/10 shadow-lg space-y-2 min-w-[200px]">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs">Engagement</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      resumenTiempoReal.engagementActual > 0.6 ? 'bg-green-500' :
                      resumenTiempoReal.engagementActual > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${resumenTiempoReal.engagementActual * 100}%` }}
                  />
                </div>
                <span className="text-white text-xs font-mono">
                  {Math.round(resumenTiempoReal.engagementActual * 100)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs">Emoción</span>
              <span className="text-white text-sm">
                {resumenTiempoReal.emocionActual === 'happy' && '😊'}
                {resumenTiempoReal.emocionActual === 'sad' && '😢'}
                {resumenTiempoReal.emocionActual === 'angry' && '😠'}
                {resumenTiempoReal.emocionActual === 'surprised' && '😲'}
                {resumenTiempoReal.emocionActual === 'neutral' && '😐'}
                {resumenTiempoReal.emocionActual === 'fearful' && '😨'}
                {resumenTiempoReal.emocionActual === 'disgusted' && '🤢'}
                {' '}{resumenTiempoReal.emocionActual}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs">Postura</span>
              <span className="text-white text-xs capitalize">
                {resumenTiempoReal.posturaActual.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs">Microexpr.</span>
              <span className="text-blue-500 text-xs font-mono">
                {resumenTiempoReal.microexpresionesCount}
              </span>
            </div>

            {/* Alertas */}
            {resumenTiempoReal.alertas.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                {resumenTiempoReal.alertas.slice(0, 2).map((alerta, i) => (
                  <p key={i} className="text-amber-400 text-xs">{alerta}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón flotante para iniciar grabación con análisis (Solo si NO es headless) */}
      {processingState.step === 'idle' && !isRecording && !headlessMode && (
        <div className="fixed bottom-6 right-6 z-[200]">
          {stream ? (
            <button
              onClick={() => setShowTypeSelector(true)}
              className="group relative flex items-center gap-3 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white px-5 py-3 rounded-2xl shadow-2xl transition-all hover:scale-105"
            >
              <span className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></span>
              <span className="font-bold text-sm">Grabar con Análisis</span>
              <span className="text-xl">🧠</span>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-black text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
                  Grabación con análisis conductual
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-zinc-800 text-zinc-400 px-5 py-3 rounded-2xl shadow-lg cursor-not-allowed">
              <span className="w-4 h-4 bg-zinc-600 rounded-full"></span>
              <span className="font-bold text-sm">Esperando cámara...</span>
              <span className="text-xl animate-spin">⏳</span>
            </div>
          )}
        </div>
      )}

      {/* Indicador de grabación activa (esquina) - Solo si NO es headless */}
      {isRecording && !headlessMode && (
        <div className="fixed top-4 left-4 z-[200]">
          <div className="flex items-center gap-3 bg-red-600 px-4 py-2 rounded-full shadow-lg">
            <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
            <span className="text-white font-mono font-bold">
              {formatDuration(processingState.duration)}
            </span>
            <button
              onClick={stopRecording}
              className="ml-2 bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs font-medium transition-colors"
            >
              Detener
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default RecordingManager;
